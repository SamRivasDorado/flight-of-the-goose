import { useEffect, useState } from 'react';
import { UIProvider, useLocalPref, useUI } from '../lib/ui';
import { LensProvider } from '../lib/lens';
import { SoloProvider, useSolo } from '../lib/solo';
import { LensBar } from '../components/Lens';
import { HelpPanel } from '../components/HelpPanel';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Welcome } from '../components/ProfileForm';
import { WorkspaceMenu } from '../components/WorkspaceMenu';
import { TaskSheet } from '../components/TaskSheet';
import { useSession } from '../auth/session';
import { Login, SetNewPassword } from '../auth/Login';
import { isConfigured } from '../lib/supabase';
import { canEdit } from '../lib/types';
import { APP_NAME, DEFAULT_PALETTE, PALETTES } from '../config';
import { Icon, Logo } from '../components/Logo';
import { Projects } from '../pages/Projects';
import { ProjectPage } from '../pages/ProjectPage';
import { Tasks } from '../pages/Tasks';
import { Team } from '../pages/Team';
import { Strategy } from '../pages/Strategy';
import { Timeline } from '../pages/Timeline';
import { Review } from '../pages/Review';
import { Insights } from '../pages/Insights';

type Page = 'timeline' | 'strategy' | 'projects' | 'tasks' | 'review' | 'team' | 'insights';
const NAV: [Page, string, Parameters<typeof Icon>[0]['name']][] = [
  ['timeline', 'Timeline', 'timeline'], ['strategy', 'Strategy', 'target'], ['projects', 'Projects', 'wall'], ['tasks', 'Tasks', 'tasks'],
  ['review', 'Review', 'review'], ['team', 'Team', 'users'], ['insights', 'Insights', 'chart'],
];
const pageFromHash = (): Page | 'project' => {
  const h = location.hash.replace('#/', '');
  if (h.startsWith('project/')) return 'project';
  return NAV.some(n => n[0] === h) ? h as Page : 'timeline';
};
/** The project id when the address is #/project/<id>. */
export const projectIdFromHash = () => { const m = location.hash.match(/^#\/project\/([\w-]+)/); return m ? m[1] : null; };

export function App() {
  if (!isConfigured) return <SetupNeeded />;
  return <SignedInGate />;
}

function SignedInGate() {
  const { session, loading, error, current, profile, recovering } = useSession();
  if (loading) return <div className="auth"><span className="muted">Loading…</span></div>;
  if (!session) return <Login />;
  if (recovering) return <SetNewPassword />;
  if (error) return <div className="auth"><div className="authbox"><b>Something went wrong</b><span className="err">{error}</span></div></div>;
  if (!current) return <div className="auth"><span className="muted">Opening your workspace…</span></div>;
  if (profile && !profile.setup_done) return <Welcome />;
  return <UIProvider><SoloProvider><LensProvider><Shell /></LensProvider></SoloProvider></UIProvider>;
}

function Shell() {
  const { solo } = useSolo();
  const [help, setHelp] = useState(false);
  const { signOut, current } = useSession();
  const [page, setPage] = useState(pageFromHash);
  const [projectId, setProjectId] = useState(projectIdFromHash);
  useEffect(() => { const f = () => { setPage(pageFromHash()); setProjectId(projectIdFromHash()); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const navl = (p: Page, label: string, ic: Parameters<typeof Icon>[0]['name']) =>
    <a key={p} href={`#/${p}`} className={`navl ${page === p || (p === 'projects' && page === 'project') ? 'on' : ''}`}><Icon name={ic} />{label}</a>;

  return (
    <div className="app">
      <header>
        <div className="bar gut">
          <button className="brand" onClick={() => setHelp(h => !h)} title={`${APP_NAME} help`} aria-label={`${APP_NAME} help`}><Logo />{APP_NAME}</button>
          <nav className="nav">
            {navl(...NAV[0])}<i className="navsep" />{NAV.slice(1, 4).map(n => navl(...n))}<i className="navsep" />{NAV.slice(4).filter(n => !(solo && n[0] === 'team')).map(n => navl(...n))}
          </nav>
          <TopTools />
          <button className="btn sm ghost" onClick={() => setHelp(h => !h)} title="Help"><Icon name="help" />Help</button>
          <WorkspaceMenu />
          <button className="btn sm ghost" onClick={() => void signOut()} title="Sign out"><Icon name="out" />Sign out</button>
        </div>
        <div className="stripe" aria-hidden="true"><i /><i /><i /><i /></div>
        <LensBar page={page} self={current!.access === 'member' || current!.access === 'guest'} />
      </header>
      <main className={`view gut ${page === 'timeline' ? 'fill' : ''}`}>
        <ErrorBoundary key={page + (projectId ?? '')}>
        {page === 'projects' && <Projects />}
        {page === 'project' && projectId && <ProjectPage key={projectId} id={projectId} />}
        {page === 'tasks' && <Tasks />}
        {page === 'team' && (solo ? <SoloNote /> : <Team />)}
        {page === 'timeline' && <Timeline />}
        {page === 'strategy' && <Strategy />}
        {page === 'review' && <Review />}
        {page === 'insights' && <Insights />}
        </ErrorBoundary>
      </main>
      <TaskSheet />
      {help && <HelpPanel page={page} onClose={() => setHelp(false)} />}
    </div>
  );
}

/** Pages that filter their own tasks by the search box; from any other page, searching opens Tasks. */
const showsTasks = () => { const p = pageFromHash(); return p === 'tasks' || p === 'timeline' || p === 'project' || p === 'review' || p === 'insights'; };

/** Search box, New task button and colour palette, as in the prototype's top bar. */
function TopTools() {
  const { current } = useSession();
  const ui = useUI();
  const [palette, setPalette] = useLocalPref<string>('palette', DEFAULT_PALETTE);
  useEffect(() => { document.documentElement.dataset.palette = palette; }, [palette]);
  const ws = current!;

  function newTask() { const pid = projectIdFromHash(); ui.newTask(pid ? { project_id: pid } : {}); }

  return (
    <>
      <label className="search"><Icon name="search" />
        <input type="search" placeholder="Search tasks" aria-label="Search tasks" value={ui.q}
          onChange={e => { ui.setQ(e.target.value); if (e.target.value && !showsTasks()) location.hash = '#/tasks'; }} /></label>
      {canEdit(ws.access) && <button className="btn primary" onClick={newTask}><Icon name="plus" />New task</button>}
      <label className="palbtn" title={`Colour palette: ${PALETTES[palette as keyof typeof PALETTES] ?? ''}`}>
        <span className="logo" aria-hidden="true"><i /><i /><i /><i /></span><Icon name="down" />
        <select aria-label="Colour palette" value={palette} onChange={e => setPalette(e.target.value)}>
          {Object.entries(PALETTES).map(([k, name]) => <option key={k} value={k}>{name}</option>)}</select></label>
    </>
  );
}

function SetupNeeded() {
  return (
    <div className="auth"><div className="authbox">
      <div className="row"><Logo variant="plain" size={52} /><h1>{APP_NAME}</h1></div>
      <p style={{ margin: 0 }}><b>Almost there.</b> Connect the app to its database: copy <code>.env.example</code> to <code>.env.local</code>, fill in your Supabase project URL and anon key, and restart <code>npm run dev</code>.</p>
      <p className="muted" style={{ margin: 0 }}>The README walks through creating the Supabase project.</p>
    </div></div>
  );
}

/** Shown if someone opens the Team address while solo mode is on. */
function SoloNote() {
  return <div className="empty">Solo mode is on, so the Team page is hidden. To work with other people, switch solo mode off in <b>Your profile</b> (your picture at the top right).</div>;
}
