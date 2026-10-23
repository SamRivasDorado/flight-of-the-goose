import { useState } from 'react';
import { useWorkspace } from '../auth/session';
import { listMembers, listNoteDates, listProjectsFull, listTasks, useLoad } from '../lib/data';
import { canManage, type Member, type ProjectFull, type Task } from '../lib/types';
import { useUI } from '../lib/ui';
import { byDue, diffDays, dueLabel, firstName, hrs } from '../lib/format';
import { elapsed, fmtDate, health, lastActivity, weeklyDone, type Health } from '../lib/projects';
import { Avatar, Icon } from '../components/Logo';
import { ProjectIcon } from '../components/ProjectChip';
import { ProjectDialog } from '../components/ProjectDialog';

export const projectHref = (id: string) => `#/project/${id}`;

export function Projects() {
  const ws = useWorkspace();
  const ui = useUI();
  const { data, error, reload } = useLoad(async () => {
    const [projects, tasks, members, noteDates] = await Promise.all([
      listProjectsFull(ws.workspace_id), listTasks(ws.workspace_id), listMembers(ws.workspace_id), listNoteDates(ws.workspace_id)]);
    return { projects, tasks, members, noteDates };
  }, [ws.workspace_id, ui.version]);
  const [dialog, setDialog] = useState<null | { kind?: 'fixed' | 'ongoing' }>(null);
  const [critOpen, setCritOpen] = useState(false);
  const manager = canManage(ws.access);

  const ps = data?.projects ?? [];
  const hp = (p: ProjectFull) => health(p, data!.tasks, data!.noteDates);
  const live = ps.filter(p => p.status !== 'closed'), closed = ps.filter(p => p.status === 'closed');
  const fixed = live.filter(p => p.kind === 'fixed'), ongoing = live.filter(p => p.kind !== 'fixed');
  const tally = { good: 0, warn: 0, quiet: 0, bad: 0, idle: 0 };
  if (data) ps.forEach(p => tally[hp(p).tone]++);
  const card = (p: ProjectFull) => <ProjectCard key={p.id} p={p} h={hp(p)} tasks={data!.tasks} members={data!.members} noteDates={data!.noteDates} />;

  return (
    <>
      <div className="ph"><h1>Projects</h1>{data && <span className="sub">{live.length} live · {closed.length} closed</span>}<span className="grow" />
        {manager && <button className="btn primary" onClick={() => setDialog({})}><Icon name="plus" />New project</button>}</div>
      {error && <div className="err">{error}</div>}
      {data && (
        <>
          <div className="statusbar">
            <span className="tonedot tone-good"><b>{tally.good}</b> on track or active</span>
            <span className="tonedot tone-warn"><b>{tally.warn}</b> need attention</span>
            <span className="tonedot tone-quiet"><b>{tally.quiet}</b> quiet</span>
            <span className="tonedot tone-bad"><b>{tally.bad}</b> off track</span>
            <span className="tonedot tone-idle"><b>{tally.idle}</b> paused or closed</span>
          </div>
          <details className="criteria" open={critOpen} onToggle={e => setCritOpen((e.target as HTMLDetailsElement).open)}>
            <summary>How project status is decided</summary>
            <div className="cgrid">
              <div><h4>Fixed-term projects</h4><ul>
                <li><span className="tonedot tone-good">On track</span><span>No overdue tasks, and the share of tasks done keeps pace with the time elapsed.</span></li>
                <li><span className="tonedot tone-warn">At risk</span><span>At least one task is overdue, or the time elapsed is more than 25 percentage points ahead of the tasks done (for example 70% of the time gone, under 45% of tasks done).</span></li>
                <li><span className="tonedot tone-bad">Past end date</span><span>The end date has passed and tasks are still open.</span></li></ul></div>
              <div><h4>Ongoing projects</h4><ul>
                <li><span className="tonedot tone-good">Active</span><span>Something happened in the last 30 days (a task created or completed, or a notebook entry) and nothing is overdue.</span></li>
                <li><span className="tonedot tone-warn">Overdue</span><span>At least one open task is past its due date.</span></li>
                <li><span className="tonedot tone-quiet">Quiet</span><span>Nothing has happened for more than 30 days.</span></li></ul>
                <h4 style={{ marginTop: 10 }}>Any project</h4><ul><li><span className="tonedot tone-idle">Paused, Closed</span><span>Set by you in the project settings.</span></li></ul></div>
            </div>
          </details>
          {ps.length === 0 && !manager && <div className="empty">You are not part of any project yet.</div>}
          <div className="sech" style={{ marginTop: 4 }}>Fixed term <span className="muted" style={{ fontSize: 13 }}>· the bar shows tasks done, the tick shows time elapsed</span></div>
          <div className="wall">{fixed.map(card)}
            {manager && <button className="newcard" onClick={() => setDialog({ kind: 'fixed' })}><Icon name="plus" />New fixed-term project</button>}</div>
          <div className="sech">Ongoing <span className="muted" style={{ fontSize: 13 }}>· support, internal work and anything without an end date</span></div>
          <div className="wall">{ongoing.map(card)}
            {manager && <button className="newcard" onClick={() => setDialog({ kind: 'ongoing' })}><Icon name="plus" />New ongoing project</button>}</div>
          {closed.length > 0 && <><div className="sech">Closed</div><div className="wall">{closed.map(card)}</div></>}
        </>
      )}
      {dialog && <ProjectDialog project={null} kind={dialog.kind} count={ps.length} onClose={() => setDialog(null)}
        onSaved={id => { setDialog(null); ui.changed(); void reload(); location.hash = projectHref(id); }} />}
    </>
  );
}

function Sparkline({ vals, color }: { vals: number[]; color: string }) {
  const max = Math.max(1, ...vals), w = 120, h = 34, step = w / (vals.length - 1);
  const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - 3 - (v / max) * (h - 8)).toFixed(1)}`);
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={color} fillOpacity=".18" />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={w} cy={pts[pts.length - 1].split(',')[1]} r="2.6" fill={color} />
    </svg>);
}

export function KindBadge({ p }: { p: Pick<ProjectFull, 'status' | 'kind'> }) {
  return <span className="tag">{p.status === 'closed' ? 'Closed' : p.status === 'paused' ? 'Paused' : p.kind === 'fixed' ? 'Fixed term' : 'Ongoing'}</span>;
}

export function AvStack({ list, max = 5 }: { list: Member[]; max?: number }) {
  return <span className="avstack">{list.slice(0, max).map(m => <Avatar key={m.id} m={m} />)}{list.length > max && <span className="av more">+{list.length - max}</span>}</span>;
}

/** Owner first, then members (the people a project card shows). */
export const projectPeople = (p: ProjectFull, members: Member[]) =>
  members.filter(m => m.id !== p.owner_member_id && p.member_ids.includes(m.id));

function ProjectCard({ p, h, tasks, members, noteDates }: { p: ProjectFull; h: Health; tasks: Task[]; members: Member[]; noteDates: { project_id: string; entry_date: string }[] }) {
  const ts = tasks.filter(t => t.project_id === p.id), open = ts.filter(t => t.status !== 'done');
  const overdue = open.filter(t => t.due_date && diffDays(t.due_date) < 0).length;
  const time = ts.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const next = open.filter(t => t.due_date).sort(byDue)[0];
  const last = lastActivity(p, tasks, noteDates);
  const owner = members.find(m => m.id === p.owner_member_id);
  let mid;
  if (p.kind === 'fixed') {
    const pct = ts.length ? Math.round(ts.filter(t => t.status === 'done').length / ts.length * 100) : 0, el = Math.round(elapsed(p) * 100);
    const left = p.end_date ? diffDays(p.end_date) : null;
    mid = <>
      <div className="pbar" style={{ ['--c' as string]: p.color }} title={`${pct}% of tasks done; ${el}% of the time has passed`}><i style={{ width: `${pct}%` }} />
        {p.start_date && p.end_date && <u style={{ left: `${el}%` }} />}</div>
      <div className="pmeta"><span>{pct}% of tasks done</span>
        <span>{p.end_date ? (left! >= 0 ? `${left} days left · ends ${fmtDate(p.end_date)}` : `ended ${fmtDate(p.end_date, { day: 'numeric', month: 'short', year: 'numeric' })}`) : 'No end date set'}</span></div></>;
  } else {
    mid = <><Sparkline vals={weeklyDone(ts)} color={p.color} />
      <div className="pmeta"><span>Completed per week, last 12 weeks</span><span>{p.start_date ? `since ${fmtDate(p.start_date, { month: 'short', year: 'numeric' })}` : ''}</span></div></>;
  }
  const nextDue = next ? dueLabel(next.due_date) : null;
  return (
    <a className={`pcard tone-${h.tone}`} style={{ ['--c' as string]: p.color, textDecoration: 'none', color: 'inherit' }} href={projectHref(p.id)}>
      <div className="top"><ProjectIcon p={p} size="lg" /><b>{p.name}</b><KindBadge p={p} /></div>
      <div className="ppl-row"><span className="who">{owner && <Avatar m={owner} size="sm" />}<span>{owner ? firstName(owner.display_name) : 'No owner'}</span><span className="muted">owner</span></span>
        <AvStack list={projectPeople(p, members)} /></div>
      <div className="body">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><span className="pill" style={{ ['--c' as string]: h.color }}>{h.label}</span></div>
        {mid}
        <div className="stats"><div><b>{open.length}</b><span>open</span></div><div><b style={overdue ? { color: 'var(--danger)' } : undefined}>{overdue}</b><span>overdue</span></div>
          <div><b>{hrs(time)}</b><span>hours logged</span></div></div>
        <div className="next">{next ? <>Next: <b>{next.title || 'Untitled task'}</b> · <span className={nextDue!.cls}>{nextDue!.text}</span></> : 'No upcoming dated tasks'}</div>
        <div className="next">{last ? `Last activity: ${dueLabel(last, true).text}` : 'No activity yet'}</div>
      </div>
    </a>);
}
