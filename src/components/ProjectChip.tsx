import type { Project } from '../lib/types';
import { Icon, type IconName } from './Logo';

type P = Pick<Project, 'name' | 'color'> & Partial<Pick<Project, 'icon'>>;

/** The coloured square with the project's symbol. */
export function ProjectIcon({ p, size = '' }: { p: P; size?: '' | 'lg' }) {
  return <span className={`picon ${size}`} style={{ ['--c' as string]: p.color }}><Icon name={(p.icon || 'folder') as IconName} /></span>;
}

/** Coloured project label used in lists, cards and the task panel. */
export function ProjectChip({ p }: { p: P | null | undefined }) {
  if (!p) return <span className="muted">—</span>;
  return <span className="pchip" style={{ ['--c' as string]: p.color }}><ProjectIcon p={p} />{p.name}</span>;
}

/** Colour for tasks with no project (calendar chips). */
export const NO_PROJECT_COLOR = '#A4AC9C';
