/**
 * Goal tags: every goal has a short name (up to 8 characters) and a colour, so it can be recognised
 * where its full title does not fit: the task list, project cards, the Lens. Sub-goals share their
 * parent's colour, so a family of goals reads as one at a glance.
 */
import type { GoalRef, Task } from './types';

export const GOAL_COLORS = ['#C9813A', '#4A7FC1', '#6B9160', '#8E5CC2', '#C2557A', '#3E9A9A', '#B49A2E', '#D0453A', '#5C6BC0', '#7D8B4F'];
export const TAG_MAX = 8;

const SKIP = new Set(['a', 'an', 'and', 'the', 'of', 'in', 'on', 'for', 'to', 'our', 'by', 'with', 'at', 'from', 'every', 'more', 'de', 'la', 'el', 'y', 'en', 'del', 'los', 'las']);

/** A tag suggested from the title: initials of the main words ("Grow our presence in North Africa" → "GPNA"). */
export function suggestTag(title: string): string {
  const words = title.normalize('NFD').replace(/\p{M}/gu, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const main = words.filter(w => !SKIP.has(w.toLowerCase()));
  const use = main.length ? main : words;
  if (!use.length) return 'GOAL';
  if (use.length === 1) return use[0].slice(0, 4).toUpperCase();
  // numbers stay whole ("Deliver 2027 plan" → "D2027P" is too long, so cut at the limit)
  return use.map(w => (/^\d+$/.test(w) ? w : w[0])).join('').toUpperCase().slice(0, TAG_MAX);
}

/** Cleans what someone types in the Short name field. */
export const cleanTag = (s: string) => s.replace(/\s+/g, '-').replace(/[^\p{L}\p{N}\-_.&]/gu, '').toUpperCase().slice(0, TAG_MAX);

/** The tag shown for a goal: its own, or the suggestion until one is saved. */
export const tagOf = (g: Pick<GoalRef, 'title' | 'short_name'>) => g.short_name || suggestTag(g.title);

/** The goal's colour: the parent's for a sub-goal; its own, or one from the palette by position among top-level goals. */
export function colorOf(g: GoalRef, goals: GoalRef[]): string {
  const top = g.parent_id ? goals.find(x => x.id === g.parent_id) ?? g : g;
  if (top.color) return top.color;
  const i = goals.filter(x => !x.parent_id).findIndex(x => x.id === top.id);
  return GOAL_COLORS[(i < 0 ? 0 : i) % GOAL_COLORS.length];
}

/** Goals in display order: each top-level goal followed by its sub-goals. */
export const goalTree = <G extends GoalRef>(goals: G[]) => goals.filter(g => !g.parent_id || !goals.some(p => p.id === g.parent_id))
  .flatMap(g => [g, ...goals.filter(k => k.parent_id === g.id)]);

/** The goals a task counts towards: its own goal first, then the goals of its project (inherited). */
export function taskGoals<G extends GoalRef & { project_ids?: string[] }>(t: Pick<Task, 'goal_id' | 'project_id'>, goals: G[]): { goal: G; inherited: boolean }[] {
  const out: { goal: G; inherited: boolean }[] = [];
  const own = t.goal_id ? goals.find(g => g.id === t.goal_id) : undefined;
  if (own) out.push({ goal: own, inherited: false });
  if (t.project_id) for (const g of goalTree(goals)) if (g.project_ids?.includes(t.project_id) && g.id !== own?.id) out.push({ goal: g, inherited: true });
  return out;
}

/** A goal and its sub-goals. */
export const familyIds = (id: string, goals: GoalRef[]) => [id, ...goals.filter(g => g.parent_id === id).map(g => g.id)];

/** Label for drop-downs: "GPNA · Grow our presence in North Africa" (sub-goals indented). */
export const goalOption = (g: GoalRef) => `${g.parent_id ? '  ↳ ' : ''}${tagOf(g)} · ${g.title}`;
