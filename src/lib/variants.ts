/**
 * Design options being compared in the prototype (switched from the goose button there).
 * The live app keeps today's look until Sam decides; the prototype starts on the new ideas.
 */
import { useEffect, useState } from 'react';
import { isDemo } from './supabase';

export type ProjectStyle = 'route' | 'bar';
export type GoalIcon = 'route' | 'people' | 'sevenths';
type Variants = { projectStyle: ProjectStyle; goalIcon: GoalIcon };
const DEFAULTS: Variants = isDemo ? { projectStyle: 'route', goalIcon: 'route' } : { projectStyle: 'bar', goalIcon: 'sevenths' };

function read<K extends keyof Variants>(k: K): Variants[K] {
  if (!isDemo) return DEFAULTS[k];
  try { const v = localStorage.getItem(`goose.variant.${k}`); return (v ? JSON.parse(v) : DEFAULTS[k]) as Variants[K]; } catch { return DEFAULTS[k]; }
}
export function setVariant<K extends keyof Variants>(k: K, v: Variants[K]) {
  try { localStorage.setItem(`goose.variant.${k}`, JSON.stringify(v)); } catch { /* ignore */ }
  window.dispatchEvent(new Event('goose:variant'));
}
export function useVariant<K extends keyof Variants>(k: K): Variants[K] {
  const [v, setV] = useState(() => read(k));
  useEffect(() => { const on = () => setV(read(k)); addEventListener('goose:variant', on); return () => removeEventListener('goose:variant', on); }, [k]);
  return v;
}
