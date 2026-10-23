import { useEffect, useState } from 'react';
import { UIProvider, useLocalPref, useUI } from '../lib/ui';
import { TaskSheet } from '../components/TaskSheet';
import { useSession } from '../auth/session';
import { Login } from '../auth/Login';
import { isConfigured } from '../lib/supabase';
import { ACCESS_LABEL, canEdit } from '../lib/types';
import { APP_NAME, DEFAULT_PALETTE, PALETTES } from '../config';
import { Icon, Logo } from '../components/Logo';
import { Projects } from '../pages/Projects';
import { Tasks } from '../pages/Tasks';
import { Team } from '../pages/Team';
import { Placeholder } from '../pages/Placeholder';

type Page = 'timeline' | 'strategy' | 'projects' | 'tasks' | 'review' | 'team' | 'insights';
const NAV: [Page, string, Parameters<typeof Icon>[0]['name']][] = [
  ['timeline', 'Timeline', 'timeline'], ['strategy', 'Strategy', 'target'], ['projects', 'Projects', 'wall'], ['tasks', 'Tasks', 'tasks'],
  ['review', 'Review', 'review'], ['team', 'Team', 'users'], ['insights', 'Insights', 'chart'],
];
const pageFromHash = (): Page => { const h = location.hash.replace('#/', '') as Page; return NAV.some(n => n[0] === h) ? h : 'tasks'; };

export function App() {
  if (!isConfigured) return <SetupNeeded />;
  return <SignedInGate />;
}

function SignedInGate() {
  const { session, loading, error, current } = useSession();
  if (loading) return <div className="auth"><span className="muted">Loading…</span></div>;
  if (!session) return <Login />;
  if (error) return <div className="auth"><div className="authbox"><b>Something went wrong</b><span className="err">{error}</span></div></div>;
  if (!current) return <div className="auth"><span className="muted">Opening your workspace…</span></div>;
  return <UIProvider><Shell /></UIProvider>;
}

function Shell() {
  const { current, workspaces, switchWorkspace, signOut } = useSession();
  const [page, setPage] = useState<Page>(pageFromHash);
  useEffect(() => { const f = () => setPage(pageFromHash()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const navl = (p: Page, label: string, ic: Parameters<typeof Icon>[0]['name']) =>
    <a key={p} href={`#/${p}`} className={`navl ${page === p ? 'on' : ''}`}><Icon name={ic} />{label}</a>;

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
          <button className="btn sm ghost" onClick={() => void signOut()} title="Sign out"><Icon name="out" />Sign out</button>
        </div>
        <div className="stripe" aria-hidden="true"><i /><i /><i /><i /></div>
      </header>
      <main className="view gut">
        {page === 'projects' && <Projects />}
        {page === 'tasks' && <Tasks />}
        {page === 'team' && <Team />}
        {page === 'timeline' && <Placeholder title="Timeline" what="Project lanes, goal bands and Monday/Friday markers come next." />}
        {page === 'strategy' && <Placeholder title="Strategy" what="Goals, sub-goals, owners and linked projects come next." />}
        {page === 'review' && <Placeholder title="Review" what="Date ranges, slipped/done/coming-up panels and the shareable summary come next." />}
        {page === 'insights' && <Placeholder title="Insights" what="The chart builder and dashboard come next." />}
      </main>
      <TaskSheet />
    </div>
  );
}

/** Search box, New task button and colour palette, as in the prototype's top bar. */
function TopTools() {
  const { current } = useSession();
  const ui = useUI();
  const [palette, setPalette] = useLocalPref<string>('palette', DEFAULT_PALETTE);
  useEffect(() => { document.documentElement.dataset.palette = palette; }, [palette]);
  const ws = current!;

  function newTask() { ui.newTask({}); }

  return (
    <>
      <label className="search"><Icon name="search" />
        <input type="search" placeholder="Search tasks" aria-label="Search tasks" value={ui.q}
          onChange={e => { ui.setQ(e.target.value); if (e.target.value && !location.hash.startsWith('#/tasks')) location.hash = '#/tasks'; }} /></label>
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
