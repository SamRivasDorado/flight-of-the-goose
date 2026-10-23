import type { Member } from '../lib/types';

/** The Goose mark. "tile" sits on a warm white square (for the dark top bar);
    "plain" is the goose alone (for light screens such as sign-in). */
export function Logo({ variant = 'tile', size = 30 }: { variant?: 'tile' | 'plain'; size?: number }) {
  const src = `${import.meta.env.BASE_URL}${variant === 'tile' ? 'goose-tile-96.png' : 'goose.png'}`;
  return <img className="brandmark" src={src} alt="" width={size} height={size} />;
}

export function Avatar({ m, size = '' }: { m: Pick<Member, 'display_name' | 'color' | 'title'> | null | undefined; size?: '' | 'xs' | 'sm' | 'lg' | 'xl' }) {
  if (!m) return null;
  const initials = m.display_name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <span className={`av ${size}`} style={{ ['--c' as string]: m.color }} title={m.title ? `${m.display_name} · ${m.title}` : m.display_name}>
      {initials}
    </span>
  );
}

const ICONS = {
  check: '<path d="m5 12 5 5 9-10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  timeline: '<path d="M3 6h10M7 12h12M5 18h8"/>',
  target: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/>',
  wall: '<path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/>',
  tasks: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6"/>',
  review: '<path d="M4 4h16v12H8l-4 4zM9 10l2 2 4-4"/>',
  users: '<path d="M9 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3 20a6 6 0 0 1 12 0M17 7a2.5 2.5 0 1 0 0 5M16 14a5 5 0 0 1 5 5"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-6M2 20h20"/>',
  out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="m15 6-6 6 6 6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  sub: '<path d="M6 4v10a3 3 0 0 0 3 3h9M15 14l3 3-3 3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  return <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}
