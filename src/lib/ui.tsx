import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Task } from './types';

/** Screen state shared by the top bar, the pages and the task panel. */
interface UIState {
  /** Text typed in the top-bar search box. */
  q: string;
  setQ: (q: string) => void;
  /** The task shown in the details panel, if any ('new' for a draft not saved yet). */
  openTaskId: string | null;
  openTask: (id: string | null) => void;
  /** Starting values for a new task; it is only saved when Create task is pressed. */
  draft: Partial<Task> | null;
  newTask: (defaults?: Partial<Task>) => void;
  /** Goes up by one after any change to tasks, so every screen reloads. */
  version: number;
  changed: () => void;
}

const Ctx = createContext<UIState | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [q, setQ] = useState('');
  const [openTaskId, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Task> | null>(null);
  const openTask = useCallback((id: string | null) => { setDraft(null); setOpen(id); }, []);
  const newTask = useCallback((defaults: Partial<Task> = {}) => { setDraft(defaults); setOpen(`new:${Date.now()}`); }, []);
  const [version, setVersion] = useState(0);
  const changed = useCallback(() => setVersion(v => v + 1), []);
  const value = useMemo(() => ({ q, setQ, openTaskId, openTask, draft, newTask, version, changed }), [q, openTaskId, openTask, draft, newTask, version, changed]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUI() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUI outside UIProvider');
  return v;
}

/** A small preference kept in this browser (week start, list grouping…). */
export function useLocalPref<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(`goose.${key}`); return s == null ? initial : JSON.parse(s) as T; } catch { return initial; }
  });
  const set = useCallback((nv: T) => {
    setV(nv);
    try { localStorage.setItem(`goose.${key}`, JSON.stringify(nv)); } catch { /* private mode */ }
  }, [key]);
  return [v, set];
}
