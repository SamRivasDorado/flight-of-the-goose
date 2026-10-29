import { useState } from 'react';
import { useSolo } from '../lib/solo';
import { useWorkspace } from '../auth/session';
import { listMembers, listNoteDates, listProjectsFull, listTasks, useLoad } from '../lib/data';
import { canManage, type Member, type ProjectFull, type Task } from '../lib/types';
import { useLocalPref, useUI } from '../lib/ui';
import { useLens } from '../lib/lens';
import { GoalTag } from '../components/GoalTag';
import { goalTree } from '../lib/goaltag';
import { OptPill } from '../components/Lens';
import { byDue, diffDays, dueLabel, firstName, hrs } from '../lib/format';
import { elapsed, fmtDate, health, lastActivity, type Health } from '../lib/projects';
import { STATUS } from '../lib/status';
import { Avatar, Icon } from '../components/Logo';
import { ProjectIcon } from '../components/ProjectChip';
import { ProjectRoute } from '../components/Geese';
import { plural, projectLeg } from '../lib/legs';
import { ProjectDialog } from '../components/ProjectDialog';

export const projectHref = (id: string) => `#/project/${id}`;

export function Projects() {
  const ws = useWorkspace();
  const ui = useUI();
  const lens = useLens();
  const { data, error, reload } = useLoad(async () => {
    const [projects, tasks, members, noteDates] = await Promise.all([
      listProjectsFull(ws.workspace_id), listTasks(ws.workspace_id), listMembers(ws.workspace_id), listNoteDates(ws.workspace_id)]);
    return { projects, tasks, members, noteDates };
  }, [ws.workspace_id, ui.version]);
  const [dialog, setDialog] = useState<null | { kind?: 'fixed' | 'ongoing' }>(null);
  const manager = canManage(ws.access);
  const [showDone, setShowDone] = useLocalPref('showDoneProjects', false);

  const ps = (data?.projects ?? []).filter(p => lens.project(p, data!.tasks));
  const hp = (p: ProjectFull) => health(p, data!.tasks, data!.noteDates);
  const live = ps.filter(p => p.status !== 'closed'), closed = ps.filter(p => p.status === 'closed');
  const fixed = live.filter(p => p.kind === 'fixed'), ongoing = live.filter(p => p.kind !== 'fixed');
  const tally = { on_track: 0, at_risk: 0, off_track: 0, quiet: 0, paused: 0, done: 0 };
  if (data) ps.forEach(p => tally[hp(p).id]++);
  const card = (p: ProjectFull) => <ProjectCard key={p.id} p={p} h={hp(p)} tasks={data!.tasks} members={data!.members} noteDates={data!.noteDates} />;

  return (
    <>
      <div className="ph"><h1>Projects</h1>{data && <span className="sub">{live.length} live · {closed.length} done</span>}<span className="grow" />
        {manager && <button className="btn primary" onClick={() => setDialog({})}><Icon name="plus" />New project</button>}</div>
      {error && <div className="err">{error}</div>}
      {data && (
        <>
          <div className="statusbar">
            {(['on_track', 'at_risk', 'off_track', 'quiet', 'paused', 'done'] as const).map(k =>
              <span key={k} className={`tonedot tone-${STATUS[k].tone}`}><b>{tally[k]}</b> {STATUS[k].label.toLowerCase()}</span>)}
            <label className="chk" style={{ marginLeft: 'auto' }}><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />Show completed</label>
          </div>
          {ps.length === 0 && !manager && <div className="empty">You are not part of any project yet.</div>}
          <div className="sech" style={{ marginTop: 4 }}>Fixed term <span className="muted" style={{ fontSize: 13 }}>· the bar shows tasks done, the tick shows time elapsed</span></div>
          <div className="wall">{fixed.map(card)}
            {manager && <button className="newcard" onClick={() => setDialog({ kind: 'fixed' })}><Icon name="plus" />New fixed-term project</button>}</div>
          <div className="sech">Ongoing <span className="muted" style={{ fontSize: 13 }}>· support, internal work and anything without an end date</span></div>
          <div className="wall">{ongoing.map(card)}
            {manager && <button className="newcard" onClick={() => setDialog({ kind: 'ongoing' })}><Icon name="plus" />New ongoing project</button>}</div>
          {closed.length > 0 && (showDone
            ? <><div className="sech">Completed</div><div className="wall">{closed.map(card)}</div></>
            : <p className="hint" style={{ marginTop: 18 }}>{closed.length === 1 ? '1 completed project is' : `${closed.length} completed projects are`} hidden. Tick “Show completed” to see {closed.length === 1 ? 'it' : 'them'}.</p>)}
        </>
      )}
      {dialog && <ProjectDialog project={null} kind={dialog.kind} count={ps.length} onClose={() => setDialog(null)}
        onSaved={id => { setDialog(null); ui.changed(); void reload(); location.hash = projectHref(id); }} />}
    </>
  );
}

export function KindBadge({ p }: { p: Pick<ProjectFull, 'status' | 'kind'> }) {
  return <span className="tag">{p.status === 'closed' ? 'Done' : p.status === 'paused' ? 'Paused' : p.kind === 'fixed' ? 'Fixed term' : 'Ongoing'}</span>;
}

export function AvStack({ list, max = 5 }: { list: Member[]; max?: number }) {
  return <span className="avstack">{list.slice(0, max).map(m => <Avatar key={m.id} m={m} />)}{list.length > max && <span className="av more">+{list.length - max}</span>}</span>;
}

/** Owner first, then members (the people a project card shows). */
export const projectPeople = (p: ProjectFull, members: Member[]) =>
  members.filter(m => m.id !== p.owner_member_id && p.member_ids.includes(m.id));

function ProjectCard({ p, h, tasks, members, noteDates }: { p: ProjectFull; h: Health; tasks: Task[]; members: Member[]; noteDates: { project_id: string; entry_date: string }[] }) {
  const { solo } = useSolo();
  const open = tasks.filter(t => t.project_id === p.id && t.status !== 'done');
  const next = open.filter(t => t.due_date).sort(byDue)[0];
  const last = lastActivity(p, tasks, noteDates);
  const owner = members.find(m => m.id === p.owner_member_id);
  const nextDue = next ? dueLabel(next.due_date) : null;
  return (
    <a className={`pcard tone-${h.tone}`} style={{ ['--c' as string]: p.color, textDecoration: 'none', color: 'inherit' }} href={projectHref(p.id)}>
      <div className="top"><ProjectIcon p={p} size="lg" /><b>{p.name}</b><KindBadge p={p} /></div>
      {!solo && <div className="ppl-row"><span className="who">{owner && <Avatar m={owner} size="sm" />}<span>{owner ? firstName(owner.display_name) : 'No owner'}</span><span className="muted">owner</span></span>
        <AvStack list={projectPeople(p, members)} /></div>}
      <div className="body">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span className="pill" style={{ ['--c' as string]: h.color }} title={`${h.label}: ${h.why}`}>{h.label}</span><ProjectDims id={p.id} /></div>
        <ProjectProgress p={p} tasks={tasks} members={members} />
        <div className="next">{next ? <>Next: <b>{next.title || 'Untitled task'}</b> · <span className={nextDue!.cls}>{nextDue!.text}</span></> : 'No upcoming dated tasks'}</div>
        <div className="next">{last ? `Last activity: ${dueLabel(last, true).text}` : 'No activity yet'}</div>
      </div>
    </a>);
}

/** A project's progress, as on its card: fixed term = tasks done against time elapsed; ongoing = finished per week.
    Then open, overdue and hours logged. Used on the Projects wall and on the project's own page. */
export function ProjectProgress({ p, tasks, members = [], wide = false }: { p: ProjectFull; tasks: Task[]; members?: Member[]; wide?: boolean }) {
  const { solo } = useSolo();
  const ts = tasks.filter(t => t.project_id === p.id), open = ts.filter(t => t.status !== 'done');
  const overdue = open.filter(t => t.due_date && diffDays(t.due_date) < 0).length;
  const time = ts.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  // the flock: the owner first, then the members (only you in solo mode)
  const owner = members.filter(m => m.id === p.owner_member_id);
  const people = solo ? owner : [...owner, ...projectPeople(p, members)];
  let mid;
  if (p.kind === 'fixed') {
    const pct = ts.length ? Math.round(ts.filter(t => t.status === 'done').length / ts.length * 100) : 0, el = Math.round(elapsed(p) * 100);
    const left = p.end_date ? diffDays(p.end_date) : null;
    mid = <>
      <ProjectRoute pct={pct} elapsed={p.start_date && p.end_date && p.status !== 'closed' ? el : null} color={p.color} people={people}
        title={`${pct}% of tasks done; the dashed mark is where the calendar says it should be (${el}% of the time has passed)`} />
      <div className="pmeta"><span>{pct}% of tasks done</span>
        <span>{p.end_date ? (left! >= 0 ? `${left} days left · ends ${fmtDate(p.end_date)}` : `ended ${fmtDate(p.end_date, { day: 'numeric', month: 'short', year: 'numeric' })}`) : 'No end date set'}</span></div></>;
  } else {
    // ongoing: one leg per quarter, against last quarter's pace (like goals with no end date)
    const l = projectLeg(p, tasks), first = l.target == null;
    mid = <>
      <ProjectRoute pct={first ? Math.round(l.elapsed) : l.pg} elapsed={first || p.status !== 'active' ? null : Math.round(l.elapsed)} color={p.color} people={people}
        title={first ? `${l.leg.label}: ${plural(l.done, 'task')} finished so far. This first leg sets the pace for the next quarter.`
          : `${l.leg.label}: ${l.done} of ${plural(l.target!, 'task')} finished last quarter. The dashed mark is where last quarter's pace would be today.`} />
      <div className="pmeta"><span>{first ? `${l.leg.short}: ${plural(l.done, 'task')} done, setting the pace` : `${l.leg.short}: ${l.done} of ${l.target} (last quarter's pace)`}</span>
        <span>{p.start_date ? `since ${fmtDate(p.start_date, { month: 'short', year: 'numeric' })}` : ''}</span></div></>;
  }
  const stats = <div className="stats"><div><b>{open.length}</b><span>open</span></div><div><b style={overdue ? { color: 'var(--danger)' } : undefined}>{overdue}</b><span>overdue</span></div>
    <div><b>{hrs(time)}</b><span>hours logged</span></div></div>;
  return wide ? <div className="pprog"><div className="pprogbar">{mid}</div>{stats}</div> : <>{mid}{stats}</>;
}

/** The project's default dimension values as pills (Priority, Region, …). */
export function ProjectDims({ id }: { id: string }) {
  const lens = useLens();
  const goals = goalTree(lens.goals).filter(g => g.project_ids.includes(id));
  return <>{goals.map(g => <GoalTag key={g.id} g={g} goals={lens.goals} />)}{lens.dims.map(d => <OptPill key={d.id} dim={d} option={lens.projectDefault(id, d.id)} />)}</>;
}
