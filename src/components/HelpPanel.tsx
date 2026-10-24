import { useEffect, useState, type ReactNode } from 'react';
import { useSolo } from '../lib/solo';
import { APP_NAME } from '../config';
import { Icon, Logo, type IconName } from './Logo';

/** Help topics. `page` is the screen a topic explains, so Help opens on the right topic. */
interface Topic { id: string; title: string; icon: IconName; page?: string; go?: string; body: ReactNode; team?: boolean }

const TOPICS: Topic[] = [
  { id: 'start', title: `How ${APP_NAME} is organised`, icon: 'target', body: <>
    <p className="lead">{APP_NAME} works on three levels, from the long term to today:</p>
    <ol className="steps">
      <li><b>Strategy: goals.</b> The outcomes you are working towards, for example “Grow our presence in North Africa”. A goal has a period (or no end date) and can be split into sub-goals.</li>
      <li><b>Projects.</b> The pieces of work that serve those goals. A project is either <i>fixed term</i> (a start and an end, like a client study) or <i>ongoing</i> (support, internal work, anything without an end). One project can support several goals, or none.</li>
      <li><b>Tasks.</b> The concrete things to do, with a due date, an assignee and the time spent. A task usually sits in a project; it can also be linked straight to a goal.</li>
    </ol>
    <p>Progress flows upwards: finishing tasks moves the project forward, and the project’s tasks move its goals forward. So you plan from the top and work from the bottom.</p>
    <p className="hint">The top bar follows the same order: Timeline for the overview, then Strategy, Projects and Tasks, then Review, Team and Insights to look back and share.</p></> },
  { id: 'timeline', title: 'Timeline', icon: 'timeline', page: 'timeline', go: '#/timeline', body: <>
    <p className="lead">The home screen: everything on one time line, so you see at a glance what is running, what is coming and what has slipped.</p>
    <ul>
      <li><b>Goals</b> sit in the top lane as bands across their period, filled to their progress.</li>
      <li><b>Each project is a lane.</b> A solid band is a fixed-term project, ending on its end date. An ongoing project is solid up to today and hatched after, because it runs on.</li>
      <li><b>Tasks are dots</b> on their due date. A red ring means overdue; tick “Show completed” to see finished ones.</li>
      <li>Zoom with <b>Weeks / Months / Quarters</b>; <b>Today</b> brings you back. Click a project name to open it, a dot to open the task.</li>
    </ul></> },
  { id: 'strategy', title: 'Strategy', icon: 'target', page: 'strategy', go: '#/strategy', body: <>
    <p className="lead">Your goals and how far along they are.</p>
    <ul>
      <li><b>Status</b> (On track, At risk, Off track, Achieved) is your judgement.</li>
      <li><b>Progress</b> is calculated: the share of done tasks in the linked projects and the tasks linked directly to the goal. Without tasks it is the average of the sub-goals; otherwise the value you set by hand.</li>
      <li>Link projects to a goal in the goal itself or in Project settings. <b>Add task to this goal</b> creates a task linked straight to it.</li>
      <li>The year tabs show the goals running in each year.</li>
    </ul></> },
  { id: 'projects', title: 'Projects and notebooks', icon: 'wall', page: 'projects', go: '#/projects', body: <>
    <p className="lead">Every project as a card, with its status worked out for you.</p>
    <ul>
      <li><b>Fixed-term</b> projects compare tasks done with time passed: the bar is work done, the tick is time elapsed. <b>Ongoing</b> projects show activity per week instead.</li>
      <li>Open a project for its <b>Notebook</b>: meeting notes, decisions and parameters with a date. Hover any line and click <b>Make task</b> to turn it into a task linked back to the note. Decisions collect on the right.</li>
      <li><b>Project settings</b> holds the dates, status, colour, symbol or image, linked goals and default values (for example Priority) that its tasks inherit.</li>
    </ul></> },
  { id: 'tasks', title: 'Tasks', icon: 'tasks', page: 'tasks', go: '#/tasks', body: <>
    <p className="lead">All your tasks in three views.</p>
    <ul>
      <li><b>List</b>, grouped by due date, project or Priority; <b>Board</b> by status (drag a card between To do, In progress and Done); <b>Calendar</b> by day.</li>
      <li>In the calendar, drag a task to another day and choose <b>Move here</b> or <b>Copy here</b> (hold Alt while dropping to copy at once). Untick “Ask to move or copy” to always move.</li>
      <li><b>New task</b> (top bar) opens a draft that is only saved when you press <b>Create task</b>. Existing tasks save as you edit.</li>
      <li>Log <b>Time spent</b> on each task: Review and Insights use it to show where your time went.</li>
      <li>Coloured labels such as <b>Priority</b> are dimensions. A dashed label comes from the project’s default; a filled one is set on the task itself.</li>
    </ul></> },
  { id: 'review', title: 'Review', icon: 'review', page: 'review', go: '#/review', body: <>
    <p className="lead">Look back on a week, month or any period, and decide what happens next.</p>
    <ul>
      <li><b>Slipped</b>: overdue tasks, each with one-click Done, Next Monday, +1 week or No date.</li>
      <li><b>Done</b> and <b>Coming up</b> for the period, and <b>Quiet projects</b> where nothing happened.</li>
      <li><b>Where the time went</b> by goal, project, or any dimension (combine them, for example Region × Priority).</li>
      <li><b>Summary to share</b>: a ready-written text of the period. Copy it into an email or a message for your manager or client.</li>
    </ul>
    <p className="hint">A good habit: open Review every Friday with “This week”.</p></> },
  { id: 'insights', title: 'Insights', icon: 'chart', page: 'insights', go: '#/insights', body: <>
    <p className="lead">Numbers and charts about your work.</p>
    <ul>
      <li>Key numbers: open tasks, overdue, hours logged in the last 30 days and completion rate.</li>
      <li>The <b>chart builder</b> answers questions such as “how much of our time went to North Africa?”: group by project, status, due month or any dimension, count tasks or sum hours.</li>
      <li><b>Save to dashboard</b> keeps a chart; it updates by itself as tasks change and follows you to any computer.</li>
    </ul></> },
  { id: 'team', title: 'Team and sharing', icon: 'users', page: 'team', go: '#/team', team: true, body: <>
    <p className="lead">Work together, while each person sees only what they are part of.</p>
    <ul>
      <li><b>Access levels.</b> <i>Admin</i>: everything, including inviting people. <i>Manager</i>: sees everything, creates goals and projects, reviews anyone. <i>Member</i>: works on the projects they belong to and reviews their own tasks. <i>Guest</i>: can look but not change anything, for example a client.</li>
      <li><b>Invite a person</b> with their email address; they join when they sign in with it.</li>
      <li><b>Teams</b> group people. Share a project with a team (Project settings) and everyone in it becomes a member, including people who join the team later. The team lead can change its members.</li>
      <li><b>Who works on what</b> shows people against projects, with their open tasks.</li>
      <li>Working alone? Switch on <b>solo mode</b> in Your profile (your picture, top right) to hide everything about people and teams.</li>
    </ul></> },
  { id: 'lens', title: 'The Lens and dimensions', icon: 'filter', body: <>
    <p className="lead">The Lens is the filter bar under the top bar. Whatever you pick there filters every screen at once.</p>
    <ul>
      <li>Filter by person, team, project, Priority or any other dimension; <b>Clear</b> resets it. New tasks follow the Lens (its project and person).</li>
      <li><b>Dimensions</b> (button on the right of the Lens) are shared labels such as Priority, Region or Client. Add your own, rename them and pick colours.</li>
      <li>Set default values per project; its tasks inherit them unless a task sets its own.</li>
    </ul></> },
];

/** Help, opened from the goose (top left) or the Help button. Rises from the bottom like the task panel. */
export function HelpPanel({ page, onClose }: { page: string; onClose: () => void }) {
  const { solo } = useSolo();
  const topics = TOPICS.filter(t => !(solo && t.team));
  const [sel, setSel] = useState(() => topics.find(t => t.page === (page === 'project' ? 'projects' : page))?.id ?? 'start');
  const topic = topics.find(t => t.id === sel) ?? topics[0];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet help" role="dialog" aria-label="Help">
      <div className="sh"><Logo variant="plain" size={30} /><b style={{ fontSize: 16 }}>{APP_NAME} help</b><span className="grow" />
        <button className="iconbtn" onClick={onClose} aria-label="Close help"><Icon name="x" /></button></div>
      <div className="helpbody">
        <nav className="helpnav" aria-label="Help topics">
          {topics.map(t => <button key={t.id} className={`tsel ${t.id === topic.id ? 'on' : ''}`} onClick={() => setSel(t.id)}>
            <Icon name={t.icon} /><span className="tn">{t.title}</span></button>)}
        </nav>
        <article className="helptext">
          <h2>{topic.title}</h2>
          {topic.body}
          {topic.go && page !== topic.page && <a className="btn sm" href={topic.go} onClick={onClose}>Open {topic.title.split(' ')[0]} <Icon name="arrow" /></a>}
        </article>
      </div>
    </div>);
}
