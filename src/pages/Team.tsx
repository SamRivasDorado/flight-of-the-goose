import { useRef, useState, type RefObject } from 'react';
import { useWorkspace } from '../auth/session';
import { db } from '../lib/supabase';
import { listMembers, listProjectsFull, listTasksFull, listTeams, useLoad } from '../lib/data';
import { ACCESS_DESC, ACCESS_LABEL, canManage, type Member, type ProjectFull, type TaskFull, type Team } from '../lib/types';
import { useLocalPref, useUI } from '../lib/ui';
import { diffDays, hrs } from '../lib/format';
import { Avatar, Icon } from '../components/Logo';
import { ProjectChip, ProjectIcon } from '../components/ProjectChip';
import { PersonDialog, TeamAvatar, TeamDialog } from '../components/TeamDialogs';
import { CopyPicture } from '../components/CopyPicture';
import { snapshot } from '../lib/snapshot';
import { AvStack, projectHref } from './Projects';
import { loadDaysOff, type DayOff, type DaysOffData } from '../lib/holidays';
import { DaysOffDialog, HolidaysDialog, HolidaysOverview } from '../components/Holidays';

type Role = 'owner' | 'member' | 'team';

export function Team() {
  const ws = useWorkspace();
  const ui = useUI();
  const isAdmin = ws.access === 'admin';
  const { data, error, reload } = useLoad(async () => {
    const [members, teams, projects, tasks, away] = await Promise.all([listMembers(ws.workspace_id), listTeams(ws.workspace_id), listProjectsFull(ws.workspace_id), listTasksFull(ws.workspace_id),
      loadDaysOff(ws.workspace_id).catch((): DaysOffData => ({ ready: false, calendars: [], holidays: [], off: [] }))]);
    return { members, teams, projects, tasks, away };
  }, [ws.workspace_id, ui.version]);
  const [sel, setSel] = useState<string>('all');
  const mxBox = useRef<HTMLDivElement>(null);
  const [view, setView] = useLocalPref<'people' | 'matrix' | 'holidays'>('teamView', 'people');
  const [teamDlg, setTeamDlg] = useState<Team | 'new' | null>(null);
  const [personDlg, setPersonDlg] = useState<Member | 'new' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [holOpen, setHolOpen] = useState(false);
  const [offFor, setOffFor] = useState<Member | null>(null);

  if (error) return <div className="err">{error}</div>;
  if (!data) return <span className="muted">Loading…</span>;
  const { members, teams, projects, tasks, away } = data;
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
  const done = () => { setTeamDlg(null); setPersonDlg(null); setHolOpen(false); setOffFor(null); ui.changed(); void reload(); };

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
            <button className={`tab ${view === 'matrix' ? 'on' : ''}`} onClick={() => setView('matrix')}><Icon name="wall" />Who works on what</button>
            <button className={`tab ${view === 'holidays' ? 'on' : ''}`} onClick={() => setView('holidays')}><Icon name="calendar" />Holidays</button>
            {view === 'matrix' && <><span className="grow" /><CopyPicture what="the table" make={() => snapshot(mxBox.current!, { title: `Who works on what · ${team?.name ?? 'Everyone'}`, width: Math.max(560, mxBox.current!.querySelector('table')!.scrollWidth + 2) })} /></>}</div>
          {view === 'holidays' ? <HolidaysOverview data={away} people={people} admin={isAdmin} onEdit={() => setHolOpen(true)} onDaysOff={setOffFor} />
            : view === 'matrix'
            ? <Matrix people={people} projects={projects} tasks={tasks} roleIn={roleIn} box={mxBox} />
            : <div className="pcgrid">{people.map(m => (
                <PersonCard key={m.id} m={m} me={m.id === ws.member_id} teams={teams} tasks={tasks} roleIn={roleIn}
                  projects={projects.filter(p => p.status !== 'closed' && (roleIn(p, m.id) || tasks.some(t => t.project_id === p.id && t.status !== 'done'
                    && (t.assignee_member_id === m.id || t.collaborator_ids.includes(m.id)))))}
                  onTeam={setSel} onEdit={isAdmin ? () => setPersonDlg(m) : undefined}
                  off={away.off.filter(o => o.member_id === m.id)} onDaysOff={away.ready ? () => setOffFor(m) : undefined}
                  onResend={isAdmin && m.status === 'invited' ? () => void resend(m) : undefined} resending={resending === m.id} />))}
                {people.length === 0 && <div className="empty">No one in this team yet.</div>}</div>}
          {view === 'people' && people.length > 0 && <ProjectLegend />}
        </div>
      </div>
      {teamDlg && <TeamDialog team={teamDlg === 'new' ? null : teamDlg} members={members} count={teams.length} canDelete={isAdmin}
        onClose={() => setTeamDlg(null)} onSaved={id => { setSel(id ?? 'all'); setMsg(null); done(); }} />}
      {holOpen && <HolidaysDialog data={away} onClose={() => setHolOpen(false)} onSaved={done} />}
      {offFor && <DaysOffDialog member={offFor} data={away} canEdit={isAdmin || offFor.id === ws.member_id} onClose={() => setOffFor(null)} onSaved={done} />}
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

function PersonCard({ m, me, teams, tasks, projects, roleIn, onTeam, onEdit, onResend, resending, off, onDaysOff }: {
  m: Member; me: boolean; teams: Team[]; tasks: TaskFull[]; projects: ProjectFull[]; roleIn: (p: ProjectFull, id: string) => Role | null;
  onTeam: (id: string) => void; onEdit?: () => void; onResend?: () => void; resending?: boolean; off: DayOff[]; onDaysOff?: () => void;
}) {
  const todayK = new Date().toISOString().slice(0, 10);
  const now = off.find(o => o.start_day <= todayK && o.end_day >= todayK), next = off.filter(o => o.start_day > todayK).sort((a, b) => a.start_day.localeCompare(b.start_day))[0];
  const short = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const range = (o: DayOff) => o.start_day === o.end_day ? short(o.start_day) : `${short(o.start_day)} – ${short(o.end_day)}`;
  const mine = tasks.filter(t => t.assignee_member_id === m.id), open = mine.filter(t => t.status !== 'done');
  const d30 = mine.filter(t => t.status === 'done' && t.completed_at && diffDays(t.completed_at) >= -30);
  const overdue = open.filter(t => t.due_date && diffDays(t.due_date) < 0).length;
  // open tasks where they collaborate (someone else, or nobody, is the assignee)
  const helping = tasks.filter(t => t.status !== 'done' && t.assignee_member_id !== m.id && t.collaborator_ids.includes(m.id)).length;
  // owned projects first, then the ones they are in, then the ones they only work on tasks in
  const rank = (p: ProjectFull) => { const r = roleIn(p, m.id); return r === 'owner' ? 0 : r ? 1 : 2; };
  const sorted = [...projects].sort((a, b) => rank(a) - rank(b));
  const card = useRef<HTMLElement>(null);
  return (
    <article className="pc" ref={card}>
      <div className="pchead"><Avatar m={m} size="xl" />
        <div className="pcinfo">
          <div className="pcname"><b>{m.display_name}</b>{me && <span className="tag">You</span>}{m.status === 'invited' && <span className="tag invited" title="Has not signed in yet">Invited</span>}</div>
          {m.title && <span className="muted">{m.title}</span>}<span className="muted pcmail">{m.email}</span>
          <div className="pcbadges"><span className={`acc acc-${m.access}`} title={ACCESS_DESC[m.access]}>{ACCESS_LABEL[m.access]}</span>
            {teams.filter(t => t.member_ids.includes(m.id)).map(t => (
              <button key={t.id} className="tchip" title={t.name} onClick={() => onTeam(t.id)}><TeamAvatar t={t} size="xs" /><span className="pcn">{t.name}</span>
                {t.lead_member_id === m.id && <span className="pcrole">· lead</span>}</button>))}</div>
          {onResend && <div className="nosnap"><button className="btn sm" onClick={onResend} disabled={resending} title="Email the invitation to this person again">{resending ? 'Sending…' : 'Send the invitation again'}</button></div>}
        </div>
        <div className="pctools nosnap">
          <CopyPicture what="this card" make={() => snapshot(card.current!, { width: card.current!.getBoundingClientRect().width })} />
          {onEdit && <button className="iconbtn" onClick={onEdit} aria-label={`Edit ${m.display_name}`}><Icon name="edit" /></button>}</div>
      </div>
      {onDaysOff && <div className="pcoff">
        <Icon name="calendar" />
        <span>{now ? <><b>Away now</b> until {short(now.end_day)}{now.note ? ` · ${now.note}` : ''}</> : next ? <>Next days off: {range(next)}{next.note ? ` · ${next.note}` : ''}</> : <span className="muted">No days off planned</span>}</span>
        <button className="linkbtn nosnap" onClick={onDaysOff}>{me ? 'Your days off' : 'Days off'}</button></div>}
      <div className="pcstats">
        <div><b>{open.length}</b><span>★ tasks owned</span></div><div><b>{helping}</b><span>○ collaborating</span></div><div><b className={overdue ? 'od' : ''}>{overdue}</b><span>overdue</span></div>
        <div><b>{d30.length}</b><span>done, 30 days</span></div><div><b>{hrs(d30.reduce((s, t) => s + (Number(t.hours) || 0), 0))}</b><span>hours, 30 days</span></div></div>
      <div><div className="h3 gsect">Projects</div><div className="links">
        {sorted.map(p => {
          // the same look and numbers as this person's cell in "Who works on what"
          const r = roleIn(p, m.id), here = tasks.filter(t => t.project_id === p.id && t.status !== 'done');
          const own = here.filter(t => t.assignee_member_id === m.id).length;
          const helps = here.filter(t => t.assignee_member_id !== m.id && t.collaborator_ids.includes(m.id)).length;
          const where = r === 'owner' ? 'owns the project' : r === 'member' ? 'in the project' : r === 'team' ? 'in the project through a team' : 'not in the project, but works on its tasks';
          const tip = `${p.name}: ${m.display_name} ${where}; owns ${own} open task${own === 1 ? '' : 's'}, collaborates on ${helps}`;
          return (
          <a key={p.id} className="pclink" href={projectHref(p.id)} title={tip} aria-label={tip}>
            <span className={`pchip ${r ? 'pcin' : 'pcout'} ${r === 'owner' ? 'pclead' : ''}`} style={{ ['--c' as string]: p.color }}><ProjectIcon p={p} /><span className="pcn">{p.name}</span>
              {(own > 0 || helps > 0) && <span className="pccount">{own > 0 && <span>★ {own}</span>}{helps > 0 && <span>○ {helps}</span>}</span>}</span></a>); })}
        {sorted.length === 0 && <span className="hint">Not in any project yet.</span>}</div></div>
    </article>);
}

/** What the project looks and ★/○ numbers mean; the same under the person cards and under "Who works on what". */
function ProjectLegend({ extra }: { extra?: string }) {
  return (
    <div className="legend" style={{ marginTop: 10 }}><span><b>★ 3</b> open tasks they own</span><span><b>○ 2</b> open tasks they collaborate on</span>
      <span><i className="mxkey in lead" /> owns the project</span><span><i className="mxkey in" /> in the project</span><span><i className="mxkey out" /> not in the project, but works on its tasks</span>
      {extra && <span>{extra}</span>}</div>);
}

const Count = ({ own, helps }: { own: number; helps: number }) => <>{own > 0 && <span className="mxo">★ {own}</span>}{helps > 0 && <span className="mxk">○ {helps}</span>}{!own && !helps && <span className="muted">0</span>}</>;

function Matrix({ people, projects, tasks, roleIn, box }: {
  people: Member[]; projects: ProjectFull[]; tasks: TaskFull[]; roleIn: (p: ProjectFull, id: string) => Role | null; box: RefObject<HTMLDivElement>;
}) {
  const cols = projects.filter(p => p.status !== 'closed').sort((a, b) => a.name.localeCompare(b.name));
  if (!cols.length || !people.length) return <div className="empty">Nothing to show yet. Create projects and add people to them.</div>;
  // ★ open tasks they own, ○ open tasks they collaborate on, per person and project
  const cell = (m: Member, p: ProjectFull) => {
    const here = tasks.filter(t => t.project_id === p.id && t.status !== 'done');
    return { own: here.filter(t => t.assignee_member_id === m.id).length, helps: here.filter(t => t.assignee_member_id !== m.id && t.collaborator_ids.includes(m.id)).length };
  };
  const grid = people.map(m => cols.map(p => cell(m, p)));
  const sum = (xs: { own: number; helps: number }[]) => xs.reduce((a, x) => ({ own: a.own + x.own, helps: a.helps + x.helps }), { own: 0, helps: 0 });
  const rowTot = grid.map(sum), colTot = cols.map((_, j) => sum(grid.map(r => r[j]))), all = sum(rowTot);
  return (
    <div ref={box} className="mxbox">
      <div className="mxwrap"><table className="mx">
        <thead><tr><th className="mxp">Person</th>{cols.map(p => <th key={p.id}><a href={projectHref(p.id)} className="mxh" style={{ textDecoration: 'none', color: 'inherit' }}><ProjectIcon p={p} /><span>{p.name}</span></a></th>)}
          <th className="mxtot">Total</th></tr></thead>
        <tbody>{people.map((m, i) => (
          <tr key={m.id}><th className="mxp"><span className="who"><Avatar m={m} size="sm" /><span>{m.display_name}<br /><span className="muted">{m.title}</span></span></span></th>
            {cols.map((p, j) => {
              const r = roleIn(p, m.id), { own: open, helps } = grid[i][j];
              if (!r && !open && !helps) return <td key={p.id} className="mx-empty" />;
              // the cell is about tasks: ★ owned (assigned to them), ○ collaborating; its look says whether they are in the project
              const where = r === 'owner' ? 'owns the project' : r === 'member' ? 'in the project' : r === 'team' ? 'in the project through a team' : 'not in the project';
              const tip = `${m.display_name} on ${p.name} (${where}): owns ${open} open task${open === 1 ? '' : 's'}, collaborates on ${helps}`;
              return <td key={p.id}><a className={`mxc ${r ? 'in' : 'out'} ${r === 'owner' ? 'lead' : ''}`} href={projectHref(p.id)}
                style={{ ['--c' as string]: p.color, ['--k' as string]: Math.min(1, (open + helps / 2) / 5), textDecoration: 'none', color: 'inherit' }} title={tip} aria-label={tip}>
                {open > 0 && <span className="mxo">★ {open}</span>}{helps > 0 && <span className="mxk">○ {helps}</span>}</a></td>;
            })}
            <td className="mxtot" title={`${m.display_name}, in these projects: owns ${rowTot[i].own} open tasks, collaborates on ${rowTot[i].helps}`}><Count {...rowTot[i]} /></td></tr>))}</tbody>
        <tfoot><tr><th className="mxp mxtot">Total</th>
          {cols.map((p, j) => <td key={p.id} className="mxtot" title={`${p.name}: the people shown own ${colTot[j].own} open tasks and collaborate on ${colTot[j].helps}`}><Count {...colTot[j]} /></td>)}
          <td className="mxtot mxall"><Count {...all} /></td></tr></tfoot></table></div>
      <ProjectLegend extra="The darker the cell, the busier they are there. Totals add up the cells of each row and column." />
    </div>);
}
