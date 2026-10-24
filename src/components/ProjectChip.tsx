import type { Project } from '../lib/types';
import { imageUrl } from '../lib/images';
import { Icon, type IconName } from './Logo';

type P = Pick<Project, 'name' | 'color'> & Partial<Pick<Project, 'icon' | 'image_path' | 'image_fit'>>;

/** The coloured square with the project's symbol, or its own image. `src` shows an image not saved yet. */
export function ProjectIcon({ p, size = '', src }: { p: P; size?: '' | 'lg'; src?: string | null }) {
  const url = src !== undefined ? src : imageUrl(p.image_path);
  if (url) return <span className={`picon img ${size}`} style={{ ['--c' as string]: p.color }}><img src={url} alt="" className={p.image_fit === 'fill' ? 'fill' : ''} /></span>;
  return <span className={`picon ${size}`} style={{ ['--c' as string]: p.color }}><Icon name={(p.icon || 'folder') as IconName} /></span>;
}

/** Coloured project label used in lists, cards and the task panel. */
export function ProjectChip({ p }: { p: P | null | undefined }) {
  if (!p) return <span className="muted">—</span>;
  return <span className="pchip" style={{ ['--c' as string]: p.color }}><ProjectIcon p={p} />{p.name}</span>;
}

/** Colour for tasks with no project (calendar chips). */
export const NO_PROJECT_COLOR = '#A4AC9C';
