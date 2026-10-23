import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { db } from '../lib/supabase';
import type { WorkspaceRef } from '../lib/types';

interface SessionState {
  session: Session | null;
  loading: boolean;
  error: string | null;
  workspaces: WorkspaceRef[];
  current: WorkspaceRef | null;
  switchWorkspace: (id: string) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);
const LAST_WS = 'pt.lastWorkspace';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() => {
    try { return localStorage.getItem(LAST_WS); } catch { return null; }
  });

  // After every sign-in: create the profile, accept invitations, and make a
  // personal workspace when the person has none (see on_login in the migration).
  const bootstrap = useCallback(async (s: Session) => {
    setError(null);
    const name = (s.user.user_metadata?.full_name as string | undefined) ?? null;
    const { data, error } = await db().rpc('on_login', { p_full_name: name });
    if (error) { setError(`Could not open your workspace: ${error.message}`); return; }
    setWorkspaces((data ?? []) as WorkspaceRef[]);
  }, []);

  useEffect(() => {
    const client = db();
    client.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await bootstrap(data.session);
      setLoading(false);
    });
    const { data: sub } = client.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' && s) void bootstrap(s);
      if (event === 'SIGNED_OUT') setWorkspaces([]);
    });
    return () => sub.subscription.unsubscribe();
  }, [bootstrap]);

  const current = useMemo(
    () => workspaces.find(w => w.workspace_id === currentId) ?? workspaces[0] ?? null,
    [workspaces, currentId],
  );

  const value: SessionState = {
    session, loading, error, workspaces, current,
    switchWorkspace: (id) => { setCurrentId(id); try { localStorage.setItem(LAST_WS, id); } catch { /* private mode */ } },
    signOut: async () => { await db().auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}

/** The current workspace; only call inside the signed-in part of the app. */
export function useWorkspace(): WorkspaceRef {
  const { current } = useSession();
  if (!current) throw new Error('No workspace selected');
  return current;
}
