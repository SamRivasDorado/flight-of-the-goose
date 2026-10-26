import { db } from './supabase';
import { goalProgress } from './goals';
import type { Goal, Task } from './types';

/**
 * The flying geese. One goose crosses the screen when a task is done; a V of nine
 * when a project is done or a goal is reached. Each person can switch them off in
 * Your profile (remembered in this browser), and they never fly when the computer
 * asks for reduced motion.
 */

const WING = 'M120 60 C 118 32, 94 6, 50 -6 C 57 6, 60 13, 63 18 Q 57 25, 66 30 Q 61 38, 71 42 Q 68 50, 78 54 Q 76 60, 84 62 Z';

/** Side view of the goose in flight, facing right, in the style of the app icon. Wings flap via CSS (.gw). */
export function gooseMarkup(delay = 0) {
  const d = delay ? ` style="animation-delay:${delay.toFixed(2)}s"` : '';
  return `<svg class="fgoose" viewBox="0 -12 200 124" aria-hidden="true">
<g class="gw"${d}><path d="${WING}" transform="translate(14 -2)" fill="#D6D6D2" stroke="#1b1b1b" stroke-width="3" stroke-linejoin="round"/></g>
<path d="M58 84 l-14 9 l9 0 l-4 8 l14 -12" fill="#F08A24" stroke="#1b1b1b" stroke-width="2.4" stroke-linejoin="round"/>
<path d="M24 70 C 36 58, 70 52, 106 56 C 120 57, 130 52, 140 44 C 148 37, 156 30, 166 29 C 178 28, 186 36, 184 45 C 182 52, 174 53, 166 54 C 158 56, 150 62, 146 70 C 140 84, 120 94, 92 94 C 70 94, 54 88, 44 82 C 36 78, 30 74, 24 70 Z" fill="#fff" stroke="#1b1b1b" stroke-width="3.2" stroke-linejoin="round"/>
<path d="M24 70 C 30 74, 40 76, 48 75" fill="none" stroke="#1b1b1b" stroke-width="2.2" stroke-linecap="round"/>
<path d="M66 88 C 88 93, 116 90, 134 80" fill="none" stroke="#CFCFCB" stroke-width="6" stroke-linecap="round" opacity=".85"/>
<path d="M183 38 L199 43 L183 49 Z" fill="#F08A24" stroke="#1b1b1b" stroke-width="2.4" stroke-linejoin="round"/>
<circle cx="173" cy="38" r="2.8" fill="#1b1b1b"/>
<g class="gw"${d}><path d="${WING}" fill="#fff" stroke="#1b1b1b" stroke-width="3.2" stroke-linejoin="round"/>
<path d="M110 50 C 104 34, 90 20, 70 12 M100 56 C 94 44, 84 36, 72 30" fill="none" stroke="#1b1b1b" stroke-width="1.8" stroke-linecap="round" opacity=".45"/></g></svg>`;
}

export const GEESE_KEY = 'geese';
/** Whether this person wants the flights (Your profile). Stored like the other per-browser preferences. */
export function geeseOn(): boolean {
  try { const v = localStorage.getItem(`goose.${GEESE_KEY}`); return v == null ? true : JSON.parse(v) !== false; } catch { return true; }
}
const calm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const canFly = () => typeof document !== 'undefined' && geeseOn() && !calm();

function layer() {
  let l = document.querySelector<HTMLDivElement>('.flyover');
  if (!l) { l = document.createElement('div'); l.className = 'flyover'; document.body.appendChild(l); }
  return l;
}
function launch(f: HTMLDivElement) {
  f.addEventListener('animationend', e => { if (e.target === f) f.remove(); });
  layer().appendChild(f);
}

/** One goose across the screen: a task is done. */
export function flyOne() {
  if (!canFly()) return;
  const f = document.createElement('div');
  f.className = 'flyer one';
  f.style.top = `${innerHeight * (0.22 + Math.random() * 0.3)}px`;
  f.style.setProperty('--dur', '3.2s');
  f.style.setProperty('--y1', `${-(40 + Math.random() * 60)}px`);
  f.innerHTML = `<div class="bob">${gooseMarkup()}</div>`;
  launch(f);
}

/** A V of nine geese: a project is done or a goal is reached. */
export function flyV() {
  if (!canFly()) return;
  const g = Math.min(128, Math.max(66, innerWidth * 0.09));
  const n = 9, arms = Math.ceil((n - 1) / 2), dx = g * 0.66, dy = g * 0.24, h = arms * dy * 2 + g * 0.7;
  const f = document.createElement('div');
  f.className = 'flyer flock';
  f.style.width = `${arms * dx + g}px`; f.style.height = `${h}px`;
  f.style.top = `${Math.max(20, innerHeight * 0.45 - h / 2)}px`;
  f.style.setProperty('--dur', '5.2s'); f.style.setProperty('--y1', '-50px'); f.style.setProperty('--g', `${g}px`);
  let html = '';
  for (let i = 0; i < n; i++) {
    const r = Math.ceil(i / 2), side = i === 0 ? 0 : (i % 2 ? -1 : 1);
    html += `<div class="bird" style="left:${(arms - r) * dx}px;top:${h / 2 - g * 0.33 + side * r * dy}px"><div class="bob" style="animation-delay:${(-Math.random()).toFixed(2)}s">${gooseMarkup(-Math.random() * 0.34)}</div></div>`;
  }
  f.innerHTML = html;
  launch(f);
}

function say(msg: string) {
  document.querySelectorAll('.toast.geese').forEach(x => x.remove());
  const t = document.createElement('div'); t.className = 'toast geese'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}

/** A project was just closed. */
export function celebrateProject(name: string) { if (!canFly()) return; flyV(); say(`Project done: ${name}`); }
/** A goal was just marked achieved. */
export function celebrateGoal(title: string) { if (!canFly()) return; flyV(); say(`Goal reached: ${title}`); }

type T = Pick<Task, 'id' | 'project_id' | 'goal_id' | 'status'>;

/**
 * A task was just marked done. If that finished its fixed-term project (every task done)
 * or brought a goal to 100%, the V flies; otherwise one goose. Works out "before" by
 * putting this one task back to open, so it needs no memory of earlier states.
 */
export async function celebrateTask(taskId: string) {
  if (!canFly()) return;
  try {
    const one = await db().from('tasks').select('id, workspace_id, project_id, goal_id, status').eq('id', taskId).single();
    if (one.error || !one.data) { flyOne(); return; }
    const ws = one.data.workspace_id as string;
    const [tq, gq, lq, pq] = await Promise.all([
      db().from('tasks').select('id, project_id, goal_id, status').eq('workspace_id', ws),
      db().from('goals').select('*').eq('workspace_id', ws),
      db().from('goal_projects').select('goal_id, project_id'),
      one.data.project_id ? db().from('projects').select('name, kind').eq('id', one.data.project_id).single() : Promise.resolve({ data: null, error: null }),
    ]);
    if (tq.error || gq.error || lq.error) { flyOne(); return; }
    const after = tq.data as T[];
    const before = after.map(t => t.id === taskId ? { ...t, status: 'todo' as const } : t);
    const links = lq.data as { goal_id: string; project_id: string }[];
    const goals = (gq.data as Omit<Goal, 'project_ids'>[]).map(g => ({ ...g, project_ids: links.filter(l => l.goal_id === g.id).map(l => l.project_id) })) as Goal[];
    const prog = (g: Goal, ts: T[]) => goalProgress(g, goals, ts as Task[]);
    const reached = goals.find(g => prog(g, after) >= 100 && prog(g, before) < 100);
    if (reached) { celebrateGoal(reached.title); return; }
    const p = pq.data as { name: string; kind: string } | null;
    if (p && p.kind === 'fixed' && after.filter(t => t.project_id === one.data.project_id).every(t => t.status === 'done')) { celebrateProject(p.name); return; }
    flyOne();
  } catch { flyOne(); }
}
