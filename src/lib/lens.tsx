import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useWorkspace } from '../auth/session';
import { listCollaborations, listDims, listDimValues, listMembers, listProjectsFull, listTeams, useLoad } from './data';
import { useLocalPref, useUI } from './ui';
import { useSolo } from './solo';
import type { Dim, Member, ProjectFull, Task, Team } from './types';

/** The Lens: one set of filters (Person, Team, Project and each dimension) shared by every screen. */
export type Filt = Record<string, string>;

interface LensState {
  filt: Filt;
  setFilt: (k: string, v: string) => void;
  clear: () => void;
  any: boolean;
  dims: Dim[];
  members: Member[];
  teams: Team[];
  projects: ProjectFull[];
  /** The value a task has for a dimension: its own, or else its project's default. */
  eff: (t: Pick<Task, 'id' | 'project_id'>, fieldId: string) => { option: string | null; inherited: boolean };
  /** The project's default value for a dimension. */
  projectDefault: (projectId: string, fieldId: string) => string | null;
  taskOwn: (taskId: string, fieldId: string) => string | null;
  /** Assignee or collaborator. */
  involved: (t: Pick<Task, 'id' | 'assignee_member_id'>, memberId: string) => boolean;
  /** Whether a task passes the Lens. `self` locks Person to this member (members' Review and Insights). */
  task: (t: Task, self?: string | null) => boolean;
  /** Whether a project passes the Lens (for the Projects wall and Timeline lanes). */
  project: (p: ProjectFull, tasks: Task[]) => boolean;
  ready: boolean;
  reload: () => Promise<void>;
}

const Ctx = createContext<LensState | null>(null);

export function LensProvider({ children }: { children: ReactNode }) {
  const ws = useWorkspace();
  const ui = useUI();
  const { solo } = useSolo();
  const [stored, setStored] = useLocalPref<Record<string, Filt>>('lens', {});
  const { data, reload } = useLoad(async () => {
    const [dims, values, collabs, members, teams, projects] = await Promise.all([
      listDims(ws.workspace_id), listDimValues(), listCollaborations(), listMembers(ws.workspace_id), listTeams(ws.workspace_id), listProjectsFull(ws.workspace_id)]);
    return { dims, values, collabs, members, teams, projects };
  }, [ws.workspace_id, ui.version]);

  const value = useMemo<LensState>(() => {
    // filters are kept per workspace; drop values that no longer exist
    const raw = stored[ws.workspace_id] ?? {};
    const filt: Filt = {};
    if (data) for (const [k, v] of Object.entries(raw)) {
      if (!v) continue;
      // in solo mode the Person and Team filters are hidden, so they must not filter either
      if (solo && (k === 'person' || k === 'team')) continue;
      if (k === 'person' && !data.members.some(m => m.id === v)) continue;
      if (k === 'team' && !data.teams.some(t => t.id === v)) continue;
      if (k === 'project' && v !== 'none' && !data.projects.some(p => p.id === v)) continue;
      if (!['person', 'team', 'project'].includes(k) && !data.dims.some(d => d.id === k && d.options.some(o => o.id === v))) continue;
      filt[k] = v;
    }
    const tv = new Map<string, string>(), pd = new Map<string, string>(), co = new Map<string, Set<string>>();
    data?.values.task.forEach(r => { if (r.option_id) tv.set(`${r.task_id}|${r.field_id}`, r.option_id); });
    data?.values.project.forEach(r => pd.set(`${r.project_id}|${r.field_id}`, r.option_id));
    data?.collabs.forEach(r => { if (!co.has(r.task_id)) co.set(r.task_id, new Set()); co.get(r.task_id)!.add(r.member_id); });
    const taskOwn = (id: string, f: string) => tv.get(`${id}|${f}`) ?? null;
    const projectDefault = (pid: string, f: string) => pd.get(`${pid}|${f}`) ?? null;
    const eff = (t: Pick<Task, 'id' | 'project_id'>, f: string) => {
      const own = taskOwn(t.id, f);
      if (own) return { option: own, inherited: false };
      const inh = t.project_id ? projectDefault(t.project_id, f) : null;
      return { option: inh, inherited: !!inh };
    };
    const involved = (t: Pick<Task, 'id' | 'assignee_member_id'>, m: string) => t.assignee_member_id === m || !!co.get(t.id)?.has(m);
    const teams = data?.teams ?? [], projects = data?.projects ?? [], dims = data?.dims ?? [];
    const task = (t: Task, self?: string | null) => {
      const person = self ?? filt.person;
      if (person && !involved(t, person)) return false;
      if (filt.team) {
        const tm = teams.find(x => x.id === filt.team), p = projects.find(x => x.id === t.project_id);
        if (!tm || !(tm.member_ids.some(m => involved(t, m)) || (p && p.team_ids.includes(tm.id)))) return false;
      }
      if (filt.project && (filt.project === 'none' ? !!t.project_id && projects.some(p => p.id === t.project_id) : t.project_id !== filt.project)) return false;
      for (const d of dims) if (filt[d.id] && eff(t, d.id).option !== filt[d.id]) return false;
      return true;
    };
    const people = (p: ProjectFull) => new Set([p.owner_member_id, ...p.member_ids, ...teams.filter(t => p.team_ids.includes(t.id)).flatMap(t => t.member_ids)].filter(Boolean) as string[]);
    const project = (p: ProjectFull, tasks: Task[]) => {
      if (filt.project && filt.project !== p.id) return false;
      const mine = tasks.filter(t => t.project_id === p.id);
      if (filt.person && !(people(p).has(filt.person) || mine.some(t => involved(t, filt.person)))) return false;
      if (filt.team && !(p.team_ids.includes(filt.team) || [...people(p)].some(m => teams.find(x => x.id === filt.team)?.member_ids.includes(m)))) return false;
      const activeDims = dims.filter(d => filt[d.id]);
      if (!activeDims.length) return true;
      if (activeDims.every(d => projectDefault(p.id, d.id) === filt[d.id])) return true;
      return mine.some(t => task(t));
    };
    const setFilt = (k: string, v: string) => setStored({ ...stored, [ws.workspace_id]: { ...filt, [k]: v } });
    const clear = () => setStored({ ...stored, [ws.workspace_id]: {} });
    return { filt, setFilt, clear, any: Object.keys(filt).length > 0, dims, members: data?.members ?? [], teams, projects,
      eff, projectDefault, taskOwn, involved, task, project, ready: !!data, reload };
  }, [data, stored, setStored, ws.workspace_id, reload, solo]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLens() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLens outside LensProvider');
  return v;
}
