import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { db, landedOnRecovery } from '../lib/supabase';
import type { Profile, WorkspaceRef } from '../lib/types';

interface SessionState {
  session: Session | null;
  loading: boolean;
  error: string | null;
  workspaces: WorkspaceRef[];
  current: WorkspaceRef | null;
  switchWorkspace: (id: string) => void;
  signOut: () => Promise<void>;
  /** True after someone opens a password-reset link: the app asks for a new password first. */
  recovering: boolean;
  doneRecovering: () => void;
  /** The person's own profile; null until loaded, or when the database has no profile columns yet. */
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  /** Re-reads the workspaces you belong to (after creating one). */
  reloadWorkspaces: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);
const LAST_WS = 'pt.lastWorkspace';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recovering, setRecovering] = useState(landedOnRecovery);
  const [currentId, setCurrentId] = useState<string | null>(() => {
    try { return localStorage.getItem(LAST_WS); } catch { return null; }
  });

  // The welcome screen needs the profile columns (migration 20261023180000); without them, skip it.
  const loadProfile = useCallback(async (uid: string) => {
    const { data, error } = await db().from('profiles').select('id, full_name, title, color, avatar_url, setup_done').eq('id', uid).maybeSingle();
    setProfile(error || !data ? null : data as Profile);
  }, []);

  // After every sign-in: create the profile, accept invitations, and make a
  // personal workspace when the person has none (see on_login in the migration).
  const bootstrap = useCallback(async (s: Session) => {
    setError(null);
    const name = (s.user.user_metadata?.full_name as string | undefined) ?? null;
    const { data, error } = await db().rpc('on_login', { p_full_name: name });
    if (error) { setError(`Could not open your workspace: ${error.message}`); return; }
    await loadProfile(s.user.id);
    setWorkspaces((data ?? []) as WorkspaceRef[]);
  }, [loadProfile]);

  useEffect(() => {
    const client = db();
    client.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await bootstrap(data.session);
      setLoading(false);
    });
    const { data: sub } = client.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_IN' && s) void bootstrap(s);
      if (event === 'SIGNED_OUT') { setWorkspaces([]); setRecovering(false); }
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
    recovering,
    doneRecovering: () => setRecovering(false),
    profile,
    refreshProfile: async () => { if (session) await loadProfile(session.user.id); },
    reloadWorkspaces: async () => { if (session) await bootstrap(session); },
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
