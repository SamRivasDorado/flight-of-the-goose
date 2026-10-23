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
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  book: '<path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h12"/>',
  flask: '<path d="M9 3h6M10 3v6l-5.2 8.7A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-3.3L14 9V3M7.5 15h9"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  derrick: '<path d="M12 3 7 21M12 3l5 18M8.6 15h6.8M10 9.5h4M4 21h16"/>',
  layers: '<path d="m12 3 9 4.5-9 4.5-9-4.5z"/><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5"/>',
  mountain: '<path d="m3 20 6.5-12 4 7 2.5-4 5 9z"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2M3 13h18"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  cube: '<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/>',
  lifebuoy: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m5.6 5.6 3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
} as const;
export type IconName = keyof typeof ICONS;

/** Symbols a project can use (as in the prototype). */
export const PROJECT_ICONS: IconName[] = ['folder', 'book', 'flask', 'globe', 'derrick', 'layers', 'mountain', 'bolt', 'flag', 'star', 'chart', 'users', 'briefcase', 'map', 'mic', 'cube', 'lifebuoy'];

export function Icon({ name }: { name: IconName }) {
  return <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] ?? ICONS.folder }} />;
}
