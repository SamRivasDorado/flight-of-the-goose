import type { Member } from '../lib/types';

/** The Goose mark. "tile" sits on a warm white square (for the dark top bar);
    "plain" is the goose alone (for light screens such as sign-in). */
export function Logo({ variant = 'tile', size = 30 }: { variant?: 'tile' | 'plain'; size?: number }) {
  const src = variant === 'tile' ? '/goose-tile-96.png' : '/goose.png';
  return <img className="brandmark" src={src} alt="" width={size} height={size} />;
}

export function Avatar({ m, size = '' }: { m: Pick<Member, 'display_name' | 'color' | 'title'> | null | undefined; size?: '' | 'sm' | 'lg' | 'xl' }) {
  if (!m) return null;
  const initials = m.display_name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <span className={`av ${size}`} style={{ ['--c' as string]: m.color }} title={m.title ? `${m.display_name} · ${m.title}` : m.display_name}>
      {initials}
    </span>
  );
}

export function Icon({ name }: { name: 'check' | 'plus' | 'timeline' | 'target' | 'wall' | 'tasks' | 'review' | 'users' | 'chart' | 'out' }) {
  const paths: Record<string, string> = {
    check: 'm5 12 5 5 9-10',
    plus: 'M12 5v14M5 12h14',
    timeline: 'M3 6h10M7 12h12M5 18h8',
    target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
    wall: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
    tasks: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6',
    review: 'M4 4h16v12H8l-4 4zM9 10l2 2 4-4',
    users: 'M9 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3 20a6 6 0 0 1 12 0M17 7a2.5 2.5 0 1 0 0 5M16 14a5 5 0 0 1 5 5',
    chart: 'M4 20V11M10 20V5M16 20v-6M2 20h20',
    out: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  };
  return <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>;
}
