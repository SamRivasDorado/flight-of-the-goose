import { useWorkspace } from '../auth/session';
import { db } from './supabase';
import { useLoad } from './data';
import { useUI } from './ui';
import type { Member } from './types';

/** Your own membership in the current workspace: the name, title, colour and picture people see here. */
export function useMe(): Member | null {
  const ws = useWorkspace();
  const ui = useUI();
  const { data } = useLoad(async () => {
    const { data, error } = await db().from('workspace_members').select('*').eq('id', ws.member_id).maybeSingle();
    return error ? null : (data as Member | null);
  }, [ws.member_id, ui.version]);
  return data ?? null;
}
