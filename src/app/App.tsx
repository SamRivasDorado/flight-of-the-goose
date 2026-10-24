import { useEffect, useState } from 'react';
import { UIProvider, useLocalPref, useUI } from '../lib/ui';
import { LensProvider } from '../lib/lens';
import { LensBar } from '../components/Lens';
import { ProfileDialog, Welcome } from '../components/ProfileForm';
import { TaskSheet } from '../components/TaskSheet';
import { useSession } from '../auth/session';
import { Login, SetNewPassword } from '../auth/Login';
import { isConfigured } from '../lib/supabase';
import { ACCESS_LABEL, canEdit } from '../lib/types';
import { APP_NAME, DEFAULT_PALETTE, PALETTES } from '../config';
import { Avatar, Icon, Logo } from '../components/Logo';
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
  return <UIProvider><LensProvider><Shell /></LensProvider></UIProvider>;
}

function Shell() {
  const { current, workspaces, switchWorkspace, signOut } = useSession();
  const [page, setPage] = useState(pageFromHash);
  const [projectId, setProjectId] = useState(projectIdFromHash);
  useEffect(() => { const f = () => { setPage(pageFromHash()); setProjectId(projectIdFromHash()); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const navl = (p: Page, label: string, ic: Parameters<typeof Icon>[0]['name']) =>
    <a key={p} href={`#/${p}`} className={`navl ${page === p || (p === 'projects' && page === 'project') ? 'on' : ''}`}><Icon name={ic} />{label}</a>;

  return (
    <div className="app">
      <header>
        <div className="bar gut">
          <div className="brand"><Logo />{APP_NAME}</div>
          <nav className="nav">
            {navl(...NAV[0])}<i className="navsep" />{NAV.slice(1, 4).map(n => navl(...n))}<i className="navsep" />{NAV.slice(4).map(n => navl(...n))}
          </nav>
          <TopTools />
          {workspaces.length > 1 && (
            <select className="field-in" aria-label="Workspace" value={current!.workspace_id} onChange={e => switchWorkspace(e.target.value)}>
              {workspaces.map(w => <option key={w.workspace_id} value={w.workspace_id}>{w.workspace_name} · {ACCESS_LABEL[w.access]}</option>)}
            </select>)}
          <MeButton />
          <button className="btn sm ghost" onClick={() => void signOut()} title="Sign out"><Icon name="out" />Sign out</button>
        </div>
        <div className="stripe" aria-hidden="true"><i /><i /><i /><i /></div>
        <LensBar page={page} self={current!.access === 'member' || current!.access === 'guest'} />
      </header>
      <main className={`view gut ${page === 'timeline' ? 'fill' : ''}`}>
        {page === 'projects' && <Projects />}
        {page === 'project' && projectId && <ProjectPage key={projectId} id={projectId} />}
        {page === 'tasks' && <Tasks />}
        {page === 'team' && <Team />}
        {page === 'timeline' && <Timeline />}
        {page === 'strategy' && <Strategy />}
        {page === 'review' && <Review />}
        {page === 'insights' && <Insights />}
      </main>
      <TaskSheet />
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

/** Your picture in the top bar; opens "Your profile". */
function MeButton() {
  const { profile, session } = useSession();
  const ui = useUI();
  const [open, setOpen] = useState(false);
  if (!profile) return null;
  return (
    <>
      <button className="mebtn" title={`Your profile (${session?.user.email ?? ''})`} aria-label="Your profile" onClick={() => setOpen(true)}>
        <Avatar m={{ display_name: profile.full_name || '?', color: profile.color ?? '#5B83B5', title: profile.title, avatar_url: profile.avatar_url }} size="lg" /></button>
      {open && <ProfileDialog onClose={() => setOpen(false)} onSaved={() => { setOpen(false); ui.changed(); }} />}
    </>);
}
