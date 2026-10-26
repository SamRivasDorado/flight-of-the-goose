import { useState } from 'react';
import { useWorkspace } from '../auth/session';
import { db } from '../lib/supabase';
import { listMembers, listProjectsFull, listTasks, listTeams, useLoad } from '../lib/data';
import { ACCESS_DESC, ACCESS_LABEL, canManage, type Member, type ProjectFull, type Task, type Team } from '../lib/types';
import { useLocalPref, useUI } from '../lib/ui';
import { diffDays, hrs } from '../lib/format';
import { Avatar, Icon } from '../components/Logo';
import { ProjectChip, ProjectIcon } from '../components/ProjectChip';
import { PersonDialog, TeamAvatar, TeamDialog } from '../components/TeamDialogs';
import { AvStack, projectHref } from './Projects';

type Role = 'owner' | 'member' | 'team';
const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', member: 'Member', team: 'Through team' };

export function Team() {
  const ws = useWorkspace();
  const ui = useUI();
  const isAdmin = ws.access === 'admin';
  const { data, error, reload } = useLoad(async () => {
    const [members, teams, projects, tasks] = await Promise.all([listMembers(ws.workspace_id), listTeams(ws.workspace_id), listProjectsFull(ws.workspace_id), listTasks(ws.workspace_id)]);
    return { members, teams, projects, tasks };
  }, [ws.workspace_id, ui.version]);
  const [sel, setSel] = useState<string>('all');
  const [view, setView] = useLocalPref<'people' | 'matrix'>('teamView', 'people');
  const [teamDlg, setTeamDlg] = useState<Team | 'new' | null>(null);
  const [personDlg, setPersonDlg] = useState<Member | 'new' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);

  if (error) return <div className="err">{error}</div>;
  if (!data) return <span className="muted">Loading…</span>;
  const { members, teams, projects, tasks } = data;
  const team = sel === 'all' ? null : teams.find(t => t.id === sel) ?? null;
  const people = team ? members.filter(m => team.member_ids.includes(m.id)) : members;
  const canEditTeam = (t: Team) => isAdmin || t.lead_member_id === ws.member_id;
  const roleIn = (p: ProjectFull, id: string): Role | null =>
    p.owner_member_id === id ? 'owner' : p.member_ids.includes(id) ? 'member' : p.team_ids.some(tid => teams.find(t => t.id === tid)?.member_ids.includes(id)) ? 'team' : null;
  async function resend(m: Member) {
    setResending(m.id); setMsg(null);
    const { error } = await db().rpc('resend_invitation', { p_member: m.id });
    setResending(null);
    setMsg(error ? (error.message.includes('resend_invitation') ? 'Sending again is not available yet: the database update has not been applied.' : error.message) : `We sent the invitation to ${m.email} again.`);
  }
  const done = () => { setTeamDlg(null); setPersonDlg(null); ui.changed(); void reload(); };

  return (
    <>
      <div className="ph"><h1>Team</h1><span className="sub">{members.length} {members.length === 1 ? 'person' : 'people'} · {teams.length} {teams.length === 1 ? 'team' : 'teams'}</span><span className="grow" />
        {isAdmin && <button className="btn" onClick={() => setPersonDlg('new')}><Icon name="plus" />Invite a person</button>}
        {canManage(ws.access) && <button className="btn primary" onClick={() => setTeamDlg('new')}><Icon name="plus" />New team</button>}</div>
      {msg && <div className="note">{msg}</div>}
      <div className="teamgrid">
        <aside className="tside">
          <button className={`tsel ${sel === 'all' ? 'on' : ''}`} onClick={() => setSel('all')}><Icon name="users" /><span className="tn">Everyone</span><span className="muted">{members.length}</span></button>
          {teams.map(t => <button key={t.id} className={`tsel ${sel === t.id ? 'on' : ''}`} onClick={() => setSel(t.id)}>
            <TeamAvatar t={t} size="sm" /><span className="tn">{t.name}</span><span className="muted">{t.member_ids.length}</span></button>)}
          {teams.length === 0 && <div className="tnote">No teams yet. Teams group people, and a project shared with a team includes everyone in it.</div>}
        </aside>
        <div className="tmain">
          {team && <TeamHero t={team} members={members} projects={projects} canEdit={canEditTeam(team)} onEdit={() => setTeamDlg(team)} />}
          <div className="tabs">
            <button className={`tab ${view === 'people' ? 'on' : ''}`} onClick={() => setView('people')}><Icon name="users" />People</button>
            <button className={`tab ${view === 'matrix' ? 'on' : ''}`} onClick={() => setView('matrix')}><Icon name="wall" />Who works on what</button></div>
          {view === 'matrix'
            ? <Matrix people={people} projects={projects} tasks={tasks} roleIn={roleIn} />
            : <div className="pcgrid">{people.map(m => (
                <PersonCard key={m.id} m={m} me={m.id === ws.member_id} teams={teams} tasks={tasks} roleIn={roleIn}
                  projects={projects.filter(p => p.status !== 'closed' && roleIn(p, m.id))}
                  onTeam={setSel} onEdit={isAdmin ? () => setPersonDlg(m) : undefined}
                  onResend={isAdmin && m.status === 'invited' ? () => void resend(m) : undefined} resending={resending === m.id} />))}
                {people.length === 0 && <div className="empty">No one in this team yet.</div>}</div>}
        </div>
      </div>
      {teamDlg && <TeamDialog team={teamDlg === 'new' ? null : teamDlg} members={members} count={teams.length} canDelete={isAdmin}
        onClose={() => setTeamDlg(null)} onSaved={id => { setSel(id ?? 'all'); setMsg(null); done(); }} />}
      {personDlg && <PersonDialog person={personDlg === 'new' ? null : personDlg} teams={teams} count={members.length}
        onClose={() => setPersonDlg(null)} onSaved={m => { setMsg(m ?? null); done(); }} />}
    </>
  );
}

function TeamHero({ t, members, projects, canEdit, onEdit }: { t: Team; members: Member[]; projects: ProjectFull[]; canEdit: boolean; onEdit: () => void }) {
  const lead = members.find(m => m.id === t.lead_member_id);
  const shared = projects.filter(p => p.team_ids.includes(t.id));
  return (
    <header className="thero" style={{ ['--c' as string]: t.color }}>
      <TeamAvatar t={t} size="xl" />
      <div className="thero-main"><div className="eyebrow">Team</div><h2>{t.name}</h2>
        <div className="thero-meta"><span>Lead</span>{lead ? <span className="who"><Avatar m={lead} size="sm" />{lead.display_name}</span> : <span className="muted">none</span>}
          <span className="sepdot" /><span>{t.member_ids.length} member{t.member_ids.length === 1 ? '' : 's'}</span>
          <AvStack list={members.filter(m => t.member_ids.includes(m.id))} max={8} /></div>
        <div className="thero-meta"><span>Shared projects</span>
          {shared.map(p => <a key={p.id} href={projectHref(p.id)} style={{ textDecoration: 'none', color: 'inherit' }}><ProjectChip p={p} /></a>)}
          {shared.length === 0 && <span className="muted">none yet (share a project with this team in its Project settings)</span>}</div></div>
      <div className="drow thero-acts">{canEdit && <button className="btn sm" onClick={onEdit}><Icon name="gear" />Team settings</button>}</div>
    </header>);
}

function PersonCard({ m, me, teams, tasks, projects, roleIn, onTeam, onEdit, onResend, resending }: {
  m: Member; me: boolean; teams: Team[]; tasks: Task[]; projects: ProjectFull[]; roleIn: (p: ProjectFull, id: string) => Role | null;
  onTeam: (id: string) => void; onEdit?: () => void; onResend?: () => void; resending?: boolean;
}) {
  const mine = tasks.filter(t => t.assignee_member_id === m.id), open = mine.filter(t => t.status !== 'done');
  const d30 = mine.filter(t => t.status === 'done' && t.completed_at && diffDays(t.completed_at) >= -30);
  const overdue = open.filter(t => t.due_date && diffDays(t.due_date) < 0).length;
  const sorted = [...projects].sort((a, b) => (roleIn(a, m.id) === 'owner' ? 0 : 1) - (roleIn(b, m.id) === 'owner' ? 0 : 1));
  return (
    <article className="pc">
      <div className="pchead"><Avatar m={m} size="xl" />
        <div className="pcinfo">
          <div className="pcname"><b>{m.display_name}</b>{me && <span className="tag">You</span>}{m.status === 'invited' && <span className="tag invited" title="Has not signed in yet">Invited</span>}</div>
          {m.title && <span className="muted">{m.title}</span>}<span className="muted pcmail">{m.email}</span>
          <div className="pcbadges"><span className={`acc acc-${m.access}`} title={ACCESS_DESC[m.access]}>{ACCESS_LABEL[m.access]}</span>
            {teams.filter(t => t.member_ids.includes(m.id)).map(t => (
              <button key={t.id} className="tchip" onClick={() => onTeam(t.id)}><TeamAvatar t={t} size="xs" />{t.name}{t.lead_member_id === m.id ? ' · lead' : ''}</button>))}</div>
          {onResend && <div><button className="btn sm" onClick={onResend} disabled={resending} title="Email the invitation to this person again">{resending ? 'Sending…' : 'Send the invitation again'}</button></div>}
        </div>
        {onEdit && <button className="iconbtn" onClick={onEdit} aria-label={`Edit ${m.display_name}`}><Icon name="edit" /></button>}
      </div>
      <div className="pcstats">
        <div><b>{open.length}</b><span>open tasks</span></div><div><b className={overdue ? 'od' : ''}>{overdue}</b><span>overdue</span></div>
        <div><b>{d30.length}</b><span>done, 30 days</span></div><div><b>{hrs(d30.reduce((s, t) => s + (Number(t.hours) || 0), 0))}</b><span>hours, 30 days</span></div></div>
      <div><div className="h3 gsect">Projects</div><div className="links">
        {sorted.map(p => { const r = roleIn(p, m.id)!; return (
          <a key={p.id} href={projectHref(p.id)} title={ROLE_LABEL[r]} style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="pchip" style={{ ['--c' as string]: p.color }}><ProjectIcon p={p} />{p.name}
              {r === 'owner' && <span className="ownstar" aria-label="owner">★</span>}{r === 'team' && <span className="muted"> · team</span>}</span></a>); })}
        {sorted.length === 0 && <span className="hint">Not in any project yet.</span>}</div></div>
    </article>);
}

function Matrix({ people, projects, tasks, roleIn }: { people: Member[]; projects: ProjectFull[]; tasks: Task[]; roleIn: (p: ProjectFull, id: string) => Role | null }) {
  const cols = projects.filter(p => p.status !== 'closed').sort((a, b) => a.name.localeCompare(b.name));
  if (!cols.length || !people.length) return <div className="empty">Nothing to show yet. Create projects and add people to them.</div>;
  return (
    <>
      <div className="mxwrap"><table className="mx">
        <thead><tr><th className="mxp">Person</th>{cols.map(p => <th key={p.id}><a href={projectHref(p.id)} className="mxh" style={{ textDecoration: 'none', color: 'inherit' }}><ProjectIcon p={p} /><span>{p.name}</span></a></th>)}</tr></thead>
        <tbody>{people.map(m => (
          <tr key={m.id}><th className="mxp"><span className="who"><Avatar m={m} size="sm" /><span>{m.display_name}<br /><span className="muted">{m.title}</span></span></span></th>
            {cols.map(p => {
              const r = roleIn(p, m.id), open = tasks.filter(t => t.project_id === p.id && t.assignee_member_id === m.id && t.status !== 'done').length;
              if (!r && !open) return <td key={p.id} className="mx-empty" />;
              return <td key={p.id}><a className={`mxc ${r ?? 'none'}`} href={projectHref(p.id)} style={{ ['--c' as string]: p.color, ['--k' as string]: Math.min(1, open / 5), textDecoration: 'none', color: 'inherit' }}
                title={`${m.display_name} on ${p.name}: ${r ? ROLE_LABEL[r] : 'Assigned tasks only'}, ${open} open task${open === 1 ? '' : 's'}`}>
                <span className="mxr">{r === 'owner' ? '★' : r === 'member' ? '●' : r === 'team' ? '◌' : '·'}</span>{open > 0 && <b>{open}</b>}</a></td>;
            })}</tr>))}</tbody></table></div>
      <div className="legend" style={{ marginTop: 10 }}><span><b>★</b> owner</span><span><b>●</b> member</span><span><b>◌</b> member through a team</span>
        <span><b>·</b> has tasks there without being a member</span><span>The number is open tasks assigned to them; the darker the cell, the more they have.</span></div>
    </>);
}
