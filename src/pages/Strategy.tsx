import { useState } from 'react';
import { useSolo } from '../lib/solo';
import { useWorkspace } from '../auth/session';
import { listGoals, listHelpOffers, listMembers, listProjectsFull, listTasks, listTeams, useLoad } from '../lib/data';
import { canEdit as canEditWs, canManage, GOAL_STATUSES, type Goal, type Member, type ProjectFull, type Task, type Team } from '../lib/types';
import { useLocalPref, useUI } from '../lib/ui';
import { byDue, dueLabel, firstName } from '../lib/format';
import { goalProgress, goalRange, goalStatus, goalYears, progressSource } from '../lib/goals';
import { Avatar, Icon } from '../components/Logo';
import { ProjectChip } from '../components/ProjectChip';
import { GoalDialog } from '../components/GoalDialog';
import { AvStack, projectHref } from './Projects';
import { GoalFlag, GoalIcon, Journey, Stops } from '../components/Geese';
import { Scene, sceneOf, weatherOf } from '../components/Scene';
import { colorOf } from '../lib/goaltag';
import { GoalTag } from '../components/GoalTag';
import { legProgress, plural, shownProgress, stopsOf } from '../lib/legs';

export function Strategy() {
  const ws = useWorkspace();
  const ui = useUI();
  const manager = canManage(ws.access);
  const { data, error, reload } = useLoad(async () => {
    const [goals, projects, tasks, members, teams, offers] = await Promise.all([
      listGoals(ws.workspace_id), listProjectsFull(ws.workspace_id), listTasks(ws.workspace_id), listMembers(ws.workspace_id), listTeams(ws.workspace_id), listHelpOffers(ws.workspace_id)]);
    return { goals, projects, tasks, members, teams, offers };
  }, [ws.workspace_id, ui.version]);
  const [period, setPeriod] = useLocalPref<string>('goalPeriod', 'all');
  const [critOpen, setCritOpen] = useState(false);
  const [view, setView] = useLocalPref<'goals' | 'journey'>('strategyView', 'goals');
  const [showLog, setShowLog] = useLocalPref('showFlightLog', true);
  const { solo } = useSolo();
  const [dialog, setDialog] = useState<null | { goal: Goal | null; parentId?: string | null }>(null);

  if (error) return <div className="err">{error}</div>;
  if (!data) return <span className="muted">Loading…</span>;
  const { goals, projects, tasks, members, teams, offers } = data;
  const periods = [...new Set(goals.flatMap(goalYears))].sort();
  const per = period !== 'all' && !periods.includes(period) ? 'all' : period;
  const tops = goals.filter(g => !g.parent_id && (per === 'all' || goalYears(g).includes(per)));
  const subs = goals.filter(g => g.parent_id && tops.some(t => t.id === g.parent_id));
  const tally = (list: Goal[]) => GOAL_STATUSES.map(st => ({ st, n: list.filter(g => g.status === st.id).length })).filter(x => x.n);

  return (
    <>
      <div className="ph"><h1>Strategy</h1><span className="grow" />
        <span className="sview" role="group" aria-label="View">
          <button className={view !== 'journey' ? 'on' : ''} aria-pressed={view !== 'journey'} onClick={() => setView('goals')}><Icon name="target" />Goals</button>
          <button className={view === 'journey' ? 'on' : ''} aria-pressed={view === 'journey'} onClick={() => setView('journey')}><Icon name="map" />Journey</button></span>
        {manager && <button className="btn primary" onClick={() => setDialog({ goal: null })}><Icon name="plus" />New goal</button>}</div>
      <div className="tabs">
        <button className={`tab ${per === 'all' ? 'on' : ''}`} onClick={() => setPeriod('all')}>All goals</button>
        {periods.map(p => <button key={p} className={`tab ${per === p ? 'on' : ''}`} onClick={() => setPeriod(p)}>{p}</button>)}</div>
      <p className="intro">Goals are the long-term outcomes your projects serve. Ongoing projects can support a goal without ever finishing; progress comes from linked project tasks, from tasks linked directly, from sub-goals, or from a value you set.</p>
      <details className="criteria" open={critOpen} onToggle={e => setCritOpen((e.target as HTMLDetailsElement).open)}>
        <summary>How goal status and progress work</summary>
        <div className="cgrid">
          <div><h4>Status: set by you</h4><ul>
            {GOAL_STATUSES.map(st => <li key={st.id}><span className={`tonedot tone-${st.tone}`}>{st.label}</span><span>{st.desc}</span></li>)}</ul></div>
          <div><h4>Progress: calculated</h4><ul>
            <li><span>1.</span><span>Share of done tasks across the linked projects and the tasks linked directly to the goal.</span></li>
            <li><span>2.</span><span>If there are no such tasks: the average progress of its sub-goals.</span></li>
            <li><span>3.</span><span>Otherwise: the manual progress you set in the goal.</span></li>
            <li><span>4.</span><span>Goals with no end date are measured per quarter instead: this quarter's finished tasks against last quarter's, so the bar shows your pace. The first quarter sets the pace.</span></li></ul>
            <p className="muted" style={{ margin: '8px 0 0' }}>Status is your judgement and progress is arithmetic, so a goal can be at risk with high progress, or on track with low progress early in its period.</p></div>
        </div>
      </details>
      <div className="statusbar"><span><b>{tops.length}</b> goal{tops.length === 1 ? '' : 's'}:</span>
        {tally(tops).map(({ st, n }) => <span key={st.id} className={`tonedot tone-${st.tone}`}><b>{n}</b> {st.label.toLowerCase()}</span>)}
        {tops.length === 0 && <span>none yet</span>}
        {subs.length > 0 && <><span style={{ marginLeft: 10 }}><b>{subs.length}</b> sub-goal{subs.length === 1 ? '' : 's'}:</span>
          {tally(subs).map(({ st, n }) => <span key={st.id} className={`tonedot tone-${st.tone}`}><b>{n}</b> {st.label.toLowerCase()}</span>)}</>}
        <label className="chk" style={{ marginLeft: 'auto' }}><input type="checkbox" checked={showLog} onChange={e => setShowLog(e.target.checked)} />Show flight log</label>
      </div>
      {tops.length && view === 'journey'
        ? <div className="journeys">{tops.map(g => <Journey key={g.id} g={g} goals={goals} tasks={tasks} projects={projects} solo={solo}
            people={goalPeople(g, goals, projects, tasks, members, teams)} onEdit={manager ? goal => setDialog({ goal }) : undefined} showLog={showLog}
            offers={offers} members={members} onHelp={() => { ui.changed(); void reload(); }} />)}</div>
        : tops.length
        ? <div className="goals">{tops.map(g => <GoalCard key={g.id} g={g} goals={goals} projects={projects} tasks={tasks} members={members} teams={teams}
            canEdit={manager} onEdit={goal => setDialog({ goal })} onAddSub={() => setDialog({ goal: null, parentId: g.id })} showLog={showLog} />)}</div>
        : <div className="empty">{goals.length ? 'No goals in this year.' : manager ? <>No goals yet. Create one with <b>New goal</b>.</> : 'No goals you are involved in yet.'}</div>}
      {dialog && <GoalDialog goal={dialog.goal} parentId={dialog.parentId} goals={goals} members={members} projects={projects}
        onClose={() => setDialog(null)} onSaved={() => { setDialog(null); ui.changed(); void reload(); }} />}
    </>
  );
}

/** Owner, people on linked projects (owner, members, team members), assignees of direct tasks and sub-goal owners. */
function goalPeople(g: Goal, goals: Goal[], projects: ProjectFull[], tasks: Task[], members: Member[], teams: Team[]) {
  const ids = new Set<string>();
  if (g.owner_member_id) ids.add(g.owner_member_id);
  projects.filter(p => g.project_ids.includes(p.id)).forEach(p => {
    if (p.owner_member_id) ids.add(p.owner_member_id);
    p.member_ids.forEach(x => ids.add(x));
    teams.filter(t => p.team_ids.includes(t.id)).forEach(t => t.member_ids.forEach(x => ids.add(x)));
  });
  tasks.filter(t => t.goal_id === g.id && t.assignee_member_id).forEach(t => ids.add(t.assignee_member_id!));
  goals.filter(k => k.parent_id === g.id && k.owner_member_id).forEach(k => ids.add(k.owner_member_id!));
  return members.filter(m => ids.has(m.id));
}

function GoalCard({ g, goals, projects, tasks, members, teams, canEdit, onEdit, onAddSub, showLog }: {
  g: Goal; goals: Goal[]; projects: ProjectFull[]; tasks: Task[]; members: Member[]; teams: Team[];
  canEdit: boolean; onEdit: (g: Goal) => void; onAddSub: () => void; showLog: boolean;
}) {
  const ui = useUI();
  const ws = useWorkspace();
  const editor = canEditWs(ws.access);
  const { solo } = useSolo();
  const st = goalStatus(g.status);
  // open-ended goals are measured per quarter: this quarter's tasks against last quarter's pace
  const lp = !g.end_date && g.status !== 'achieved' ? legProgress(g, goals, tasks, projects) : null;
  const pg = lp ? lp.pg : goalProgress(g, goals, tasks);
  const owner = members.find(m => m.id === g.owner_member_id);
  const kids = goals.filter(k => k.parent_id === g.id);
  const direct = tasks.filter(t => t.goal_id === g.id).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || byDue(a, b));
  const chips = (x: Goal) => projects.filter(p => x.project_ids.includes(p.id)).map(p =>
    <a key={p.id} href={projectHref(p.id)} style={{ textDecoration: 'none', color: 'inherit' }}><ProjectChip p={p} /></a>);
  const title = (x: Goal) => <>{canEdit ? <button onClick={() => onEdit(x)}>{x.title}</button> : <span>{x.title}</span>}<GoalTag g={x} goals={goals} /></>;

  return (
    <article className={`goal tone-${st.tone}`} style={{ ['--gc' as string]: colorOf(g, goals) }}>
      <div className="gstrip"><Scene scene={sceneOf(g, goals)} weather={weatherOf(g.status)} /></div>
      <div className="gmain">
        <div className="gh"><span className="glevel">Goal</span><span className="pill" style={{ ['--c' as string]: st.color }}>{st.label}</span><span className="tag">{goalRange(g)}</span>
          <span style={{ flex: 1 }} />{owner && !solo && <span className="who"><Avatar m={owner} size="sm" />{firstName(owner.display_name)}<span className="muted">owner</span></span>}</div>
        <div className="gtitle"><GoalIcon g={g} goals={goals} size="lg" /><h3>{title(g)}</h3></div>
        {g.notes && <div className="hint">{g.notes}</div>}
        <div><div className="prog"><div className="bar2" style={{ ['--c' as string]: colorOf(g, goals) }}><i style={{ width: `${pg}%` }} /></div><GoalFlag color={colorOf(g, goals)} reached={pg >= 100} /><span className="mono muted">{lp && lp.target == null ? '–' : `${pg}%`}</span></div>
          <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{lp
            ? (lp.target == null ? `${lp.leg.label}, first leg: ${plural(lp.done, 'task')} done, setting the pace` : `${lp.leg.label} leg: ${lp.done} of ${plural(lp.target, 'task')}, last quarter's pace`)
            : progressSource(g, goals, tasks)}</div>
          {showLog && <Stops stops={stopsOf(g, goals, tasks, projects)} compact />}</div>
        {!solo && <div><div className="h3 gsect">People involved</div><AvStack list={goalPeople(g, goals, projects, tasks, members, teams)} max={10} /></div>}
        <div><div className="h3 gsect">Projects</div>{g.project_ids.length ? <div className="links">{chips(g)}</div> : <span className="hint">No linked projects</span>}</div>
        <div><div className="h3 gsect">Tasks linked directly</div>
          <div className="gtasks">{direct.slice(0, 6).map(t => { const done = t.status === 'done', d = dueLabel(t.due_date, done); return (
            <button key={t.id} className={`mini ${done ? 'mdone' : ''}`} onClick={() => ui.openTask(t.id)}>
              <i className="tickmini">{done && <Icon name="check" />}</i><span className="t">{t.title || 'Untitled task'}</span>
              <span className={`mono ${d.cls || 'muted'}`} style={{ fontSize: 12 }}>{d.text}</span></button>); })}
            {direct.length > 6 && <span className="muted" style={{ fontSize: 12 }}>and {direct.length - 6} more</span>}</div>
          {editor && <button className="btn ghost sm" style={{ alignSelf: 'flex-start', marginTop: 4 }} onClick={() => ui.newTask({ goal_id: g.id })}><Icon name="plus" />Add task to this goal</button>}</div>
      </div>
      <div className="gsubs">
        <div className="h3 gsect">Sub-goals</div>
        {kids.map(k => { const ks = goalStatus(k.status), kp = shownProgress(k, goals, tasks, projects), kd = tasks.filter(t => t.goal_id === k.id).length; return (
          <div key={k.id} className={`child tone-${ks.tone}`}>
            <div className="ct"><i className="dot" style={{ ['--c' as string]: ks.color }} title={ks.label} />{title(k)}<span className="mono muted" style={{ fontSize: 12 }}>{kp}%</span></div>
            <div className="prog sub"><div className="bar2" style={{ ['--c' as string]: colorOf(k, goals), height: 5 }}><i style={{ width: `${kp}%` }} /></div><GoalFlag color={colorOf(k, goals)} reached={kp >= 100} small /></div>
            <div className="cmeta"><span className="tag">{goalRange(k)}</span>{chips(k)}
              {kd > 0 && <span className="muted" style={{ fontSize: 12 }}>{kd} direct task{kd > 1 ? 's' : ''}</span>}
              {editor && <button className="btn ghost sm" onClick={() => ui.newTask({ goal_id: k.id })}><Icon name="plus" />Task</button>}</div>
          </div>); })}
        {kids.length === 0 && <span className="hint">No sub-goals yet. Split a large goal into steps you can track separately.</span>}
        {canEdit && <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={onAddSub}><Icon name="plus" />Add sub-goal</button>}
      </div>
    </article>);
}
