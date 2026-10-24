import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useWorkspace } from '../auth/session';
import { db } from './supabase';
import { listMembers, useLoad } from './data';
import { useUI } from './ui';

/** Solo mode: the workspace is used by one person, so people and team features are hidden everywhere. */
interface SoloState {
  solo: boolean;
  /** False until the database has the solo column (migration 20261024170000). */
  available: boolean;
  /** People in the workspace besides you (active or invited). */
  others: number;
  setSolo: (on: boolean) => Promise<void>;
}

const Ctx = createContext<SoloState>({ solo: false, available: false, others: 0, setSolo: async () => undefined });

export function SoloProvider({ children }: { children: ReactNode }) {
  const ws = useWorkspace();
  const ui = useUI();
  const { data, reload } = useLoad(async () => {
    const [w, members] = await Promise.all([
      db().from('workspaces').select('solo').eq('id', ws.workspace_id).maybeSingle(),
      listMembers(ws.workspace_id),
    ]);
    // a missing column (database not updated yet) simply means "not available, off"
    return { available: !w.error, solo: !w.error && !!(w.data as { solo?: boolean } | null)?.solo, others: members.filter(m => m.id !== ws.member_id).length };
  }, [ws.workspace_id, ui.version]);

  const value = useMemo<SoloState>(() => ({
    solo: !!data?.solo, available: !!data?.available, others: data?.others ?? 0,
    setSolo: async (on: boolean) => {
      const { error } = await db().from('workspaces').update({ solo: on }).eq('id', ws.workspace_id).select('id').single();
      if (error) throw new Error(error.message);
      await reload(); ui.changed();
    },
  }), [data, ws.workspace_id, reload, ui]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSolo = () => useContext(Ctx);
