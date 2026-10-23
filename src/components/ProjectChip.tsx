import type { Project } from '../lib/types';

/** Coloured project label used in lists, cards and the task panel. */
export function ProjectChip({ p }: { p: Pick<Project, 'name' | 'color'> | null | undefined }) {
  if (!p) return <span className="muted">—</span>;
  return <span className="pchip" style={{ ['--c' as string]: p.color }}><span className="picon" style={{ ['--c' as string]: p.color }} />{p.name}</span>;
}

/** Colour for tasks with no project (calendar chips). */
export const NO_PROJECT_COLOR = '#A4AC9C';
