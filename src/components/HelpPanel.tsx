import { useEffect, useState, type ReactNode } from 'react';
import { useSolo } from '../lib/solo';
import { APP_NAME } from '../config';
import { Icon, Logo, type IconName } from './Logo';

/** Help topics. `page` is the screen a topic explains, so Help opens on the right topic. */
interface Topic { id: string; title: string; icon: IconName; page?: string; go?: string; body: ReactNode; team?: boolean }

const TOPICS: Topic[] = [
  { id: 'start', title: `How ${APP_NAME} is organised`, icon: 'book', body: <>
    <p className="lead">{APP_NAME} works on three levels, from the long term to today:</p>
    <ol className="steps">
      <li><b>Strategy: goals.</b> The outcomes you are working towards, for example “Grow our presence in North Africa”. A goal has a period (or no end date) and can be split into sub-goals.</li>
      <li><b>Projects.</b> The pieces of work that serve those goals. A project is either <i>fixed term</i> (a start and an end, like a client study) or <i>ongoing</i> (support, internal work, anything without an end). One project can support several goals, or none.</li>
      <li><b>Tasks.</b> The concrete things to do, with a due date, an assignee and the time spent. A task usually sits in a project; it can also be linked straight to a goal.</li>
    </ol>
    <p>Progress flows upwards: finishing tasks moves the project forward, and the project’s tasks move its goals forward. So you plan from the top and work from the bottom.</p>
    <p><b>Workspaces</b> keep separate worlds apart, for example your company and an association: each has its own goals, projects, tasks and people. Click your picture (top right) to switch between them or create a new one. Your role can differ per workspace, and so can the name and picture people see.</p>
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
      <li>Every goal has a <b>tag</b>: a short name of up to 8 characters and a colour, set in the goal's form (Goose suggests one from the title). The tag stands for the goal where its name does not fit: the Goal column of the task list, project cards and pages, and the Lens. Sub-goals share their goal's colour, so a family reads as one. A <b>dashed</b> tag means the task counts towards the goal through its project.</li>
      <li><b>Journey</b> (top right) shows each goal as a route from a nest to a flag, with the people on it flying as a flock at the goal's progress. The dashed line is where the flock should be by now, going by the goal's dates. Whoever finished most this week leads; people with overdue tasks trail at the back. Hover a goose to see why.</li>
      <li>A goose that trails behind has overdue tasks; click it to <b>offer help</b> (see <i>No goose flies alone</i>).</li>
      <li><b>Goals with no end date fly in quarterly legs.</b> The route is the current quarter and the flag is last quarter's pace: finishing as many of the goal's tasks as last quarter. Ahead of the dashed line means faster than last quarter. The first quarter sets the pace.</li>
      <li>The <b>flight log</b> under each goal has a column per quarter: its height is the tasks finished, and a small flag marks each project completed. The current quarter shows a dashed outline at last quarter's height, the pace to match.</li>
      <li>The year tabs show the goals running in each year.</li>
    </ul></> },
  { id: 'projects', title: 'Projects and notebooks', icon: 'wall', page: 'projects', go: '#/projects', body: <>
    <p className="lead">Every project as a card, with its status worked out for you.</p>
    <ul>
      <li>Each project card shows its <b>route</b>: the solid part is the share of tasks done, the dashed mark is where the calendar says it should be, the flag is the end date, and the geese are the people on the project (a goose is always a person). <b>Ongoing</b> projects fly one leg per quarter: the flag is reaching last quarter's number of finished tasks; the first quarter sets the pace.</li>
      <li>Open a project for its <b>Notebook</b>: meeting notes, decisions and parameters with a date. Hover any line and click <b>Make task</b> to turn it into a task linked back to the note. Decisions collect on the right.</li>
      <li>The project page also has a <b>flight log</b>: a column per quarter for the tasks finished, once the project has run for more than one quarter. Untick <b>Show flight log</b> (above the progress) to hide it.</li>
      <li><b>Mark complete</b> (on the project's page) finishes a project: it moves to Done, the geese fly, and the day is recorded for the flight log on Strategy. If tasks are still open, you choose whether to complete them too. <b>Reopen</b> undoes it.</li>
      <li><b>Project settings</b> holds the dates, status, colour, symbol or image, linked goals and default values (for example Priority) that its tasks inherit.</li>
    </ul></> },
  { id: 'tasks', title: 'Tasks', icon: 'tasks', page: 'tasks', go: '#/tasks', body: <>
    <p className="lead">All your tasks in three views.</p>
    <ul>
      <li><b>List</b>, grouped by due date, project or Priority; <b>Board</b> by status (drag a card between To do, In progress and Done); <b>Calendar</b> by day.</li>
      <li>In the List, click a task’s <b>Project</b>, <b>Priority</b> or other dimension to change it from a drop-down, without opening the task. Pick the first choice, “(from project)”, to go back to the project’s default.</li>
      <li>In the calendar, drag a task to another day and choose <b>Move here</b> or <b>Copy here</b> (hold Alt while dropping to copy at once). Untick “Ask to move or copy” to always move.</li>
      <li><b>New task</b> (top bar) opens a draft that is only saved when you press <b>Create task</b>. Existing tasks save as you edit.</li>
      <li>Log <b>Time spent</b> on each task: Review and Insights use it to show where your time went.</li>
      <li>An overdue task assigned to someone else shows <b>Offer help</b> at the top of its panel (see <i>No goose flies alone</i>).</li>
      <li><b>Comments</b> sit at the bottom of the task panel, and under each notebook entry. Type <b>@</b> to mention someone, there and also in task descriptions and notebook entries. The <b>bell</b> in the top bar collects what is for you: mentions, comments on your tasks, and replies where you commented. Everyone who can see the task reads its comments; guests read but do not write.</li>
      <li>Finishing a task sends a goose across the screen; finishing a project or reaching a goal sends a whole V. Switch them off in Your profile (your picture, top right).</li>
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
  { id: 'help', title: 'No goose flies alone', icon: 'lifebuoy', team: true, body: <>
    <p className="lead">When a goose is hurt or tired, two others drop out of the formation and stay with it until it can fly again. Goose does the same for people who fall behind.</p>
    <h3 className="hh">Who is behind</h3>
    <ul>
      <li>Someone is <b>behind</b> when they have overdue tasks: past their due date and not done.</li>
      <li>On Strategy, in the <b>Journey</b> view, their goose trails at the back of the flock with a red <b>!</b>, and the line under the map says “Trailing: …”.</li>
      <li>This is not a ranking. It shows where a hand would help.</li>
    </ul>
    <h3 className="hh">Offering help</h3>
    <ul>
      <li><b>From the Journey:</b> click a trailing goose (or <b>Offer help</b> in the line under the map). A panel lists that person's overdue tasks on the goal, how late each one is and who is already helping. Press <b>Offer help</b> on a task.</li>
      <li><b>From a task:</b> open an overdue task assigned to someone else. A strip at the top says it is overdue, with <b>Offer help</b>.</li>
      <li>Help goes to the person the task is assigned to. Anyone who can see the task can offer, except guests.</li>
    </ul>
    <h3 className="hh">Answering an offer</h3>
    <ul>
      <li>The offer arrives in the <b>bell</b> (top bar), with <b>Accept</b> and <b>No thanks</b> right there. It also shows at the top of the task.</li>
      <li><b>Accept</b> makes the helper a collaborator on the task, so they can work on it with you. <b>No thanks</b> simply closes the offer; nobody is told off.</li>
      <li>The helper hears the answer in their bell.</li>
      <li>The helper can <b>Withdraw</b> an offer, or <b>Stop helping</b> later, from the task or the panel.</li>
    </ul>
    <h3 className="hh">What you see</h3>
    <ul>
      <li>Helpers fly beside the trailing goose as <b>companion geese</b>, with their picture. A faint companion is an offer not answered yet.</li>
      <li>Once someone is helping, the red <b>!</b> becomes a green <b>♥</b>, and the line under the map says who is helping.</li>
      <li>When the overdue tasks are done, the goose catches up with the flock and the companions return to their places.</li>
    </ul>
    <p className="hint">Not shown in solo mode, where there is nobody else to help.</p></> },
  { id: 'lens', title: 'The Lens and dimensions', icon: 'filter', body: <>
    <p className="lead">The Lens is the filter bar under the top bar. Whatever you pick there filters every screen at once.</p>
    <ul>
      <li>Filter by person, team, <b>goal</b>, project, Priority or any other dimension. A goal shows its own tasks, those of its sub-goals and those in its linked projects (the same tasks its progress counts); <b>No goal</b> shows work not connected to any goal; <b>Clear</b> resets it. New tasks follow the Lens (its project and person).</li>
      <li><b>Dimensions</b> (button on the right of the Lens) are shared labels such as Priority, Region or Client. Add your own, rename them and pick colours.</li>
      <li>Set default values per project; its tasks inherit them unless a task sets its own.</li>
    </ul></> },
  { id: 'data', title: 'Export, import and backup', icon: 'save', body: <>
    <p className="lead">Everything is saved as you work. The <b>Data</b> button in the top bar (managers and admins) takes a copy out or brings work in.</p>
    <ul>
      <li><b>Export</b> an Excel workbook (Goals, Projects and Tasks sheets) or CSV files, for reports or to edit in bulk.</li>
      <li><b>Import</b> that workbook back, or CSV files: rows keep their ID, so edits update the right items and rows without an ID are added. You see what will change before anything is saved, and importing never deletes.</li>
      <li><b>Full backup</b> saves the whole workspace, including notebooks, dimensions and teams, as one file. Restoring it creates a new workspace, so it never overwrites the one you have.</li>
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
