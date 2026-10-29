/**
 * A goal's scene: the landscape it flies over (its destination) and the weather (its status).
 * Three layers inside a positioned box: the terrain, which stretches with the width; the details
 * (trees, palms, buildings), which keep their shape and sit on the ground; and the weather on top.
 * Colours are see-through so the scenes work on light and dark themes.
 */
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import type { Goal, GoalRef } from '../lib/types';
import type { IconName } from './Logo';

export type SceneId = 'hills' | 'dunes' | 'mountains' | 'coast' | 'forest' | 'lake' | 'fields' | 'city';
export const SCENES: [SceneId, string][] = [
  ['hills', 'Green hills'], ['dunes', 'Desert'], ['mountains', 'Mountains'], ['coast', 'Coast'],
  ['forest', 'Forest'], ['lake', 'Lake'], ['fields', 'Farmland'], ['city', 'City'],
];
/** Symbols a goal can carry (shown next to its title and in the goal form). */
export const GOAL_ICONS: IconName[] = ['target', 'globe', 'star', 'flag', 'mountain', 'derrick', 'layers', 'bolt', 'chart', 'users', 'briefcase', 'map', 'book', 'flask', 'cube', 'mic', 'lifebuoy'];

/** The goal's scene: its own, else its parent's, else one by position so neighbours differ. */
export function sceneOf(g: Pick<GoalRef, 'id' | 'parent_id'> & { scene?: string | null }, goals: (GoalRef & { scene?: string | null })[]): SceneId {
  const top = g.parent_id ? goals.find(x => x.id === g.parent_id) ?? g : g;
  const own = (g.scene || top.scene) as SceneId | undefined;
  if (own && SCENES.some(s => s[0] === own)) return own;
  const i = goals.filter(x => !x.parent_id).findIndex(x => x.id === top.id);
  return SCENES[(i < 0 ? 0 : i) % SCENES.length][0];
}
export const iconOf = (g: { icon?: string | null }) => (g.icon || 'target') as IconName;

type Weather = 'clear' | 'clouds' | 'storm' | 'sunset';
export const weatherOf = (status: Goal['status']): Weather =>
  status === 'at_risk' ? 'clouds' : status === 'off_track' ? 'storm' : status === 'achieved' ? 'sunset' : 'clear';
export const WEATHER_WORD: Record<Weather, string> = { clear: 'clear skies', clouds: 'clouds gathering', storm: 'stormy', sunset: 'landed at sunset' };

/* ---- terrain: viewBox 0 0 1000 190, stretched to the box (keep the left and right ends below the nest and flag) ---- */
const TERRAIN: Record<SceneId, JSX.Element> = {
  hills: <>
    <path fill="rgba(107,145,96,.16)" d="M0 150 C 120 112, 230 128, 330 140 C 450 154, 560 104, 690 118 C 800 130, 880 100, 1000 112 L1000 190 L0 190 Z" />
    <path fill="rgba(107,145,96,.28)" d="M0 172 C 150 150, 260 164, 400 168 C 560 172, 650 146, 800 156 C 900 162, 950 150, 1000 154 L1000 190 L0 190 Z" /></>,
  dunes: <>
    <path fill="rgba(214,168,96,.16)" d="M0 145 C 90 130, 160 120, 260 138 S 420 150, 520 118 S 700 136, 780 126 S 920 112, 1000 120 L1000 190 L0 190 Z" />
    <path fill="rgba(222,176,104,.30)" d="M0 168 C 120 150, 200 150, 320 166 S 520 178, 640 152 S 860 158, 1000 150 L1000 190 L0 190 Z" />
    <path fill="none" stroke="rgba(180,130,60,.35)" strokeWidth="1.2" d="M330 166 C 420 160, 520 150, 640 152 M700 150 C 780 140, 880 146, 1000 150" /></>,
  mountains: <>
    <path fill="rgba(140,155,180,.20)" d="M0 150 L70 118 L130 132 L230 70 L300 112 L360 96 L470 62 L560 104 L640 84 L720 120 L800 78 L880 116 L1000 108 L1000 190 L0 190 Z" />
    <path fill="rgba(255,255,255,.28)" d="M210 82 L230 70 L250 82 L240 80 L230 88 L220 80 Z M452 76 L470 62 L490 78 L480 74 L470 82 L460 74 Z M784 88 L800 78 L816 90 L806 87 L800 94 L792 86 Z" />
    <path fill="rgba(105,128,108,.30)" d="M0 172 C 150 150, 260 162, 400 168 C 560 174, 650 150, 800 156 C 900 160, 950 152, 1000 154 L1000 190 L0 190 Z" /></>,
  coast: <>
    <path fill="rgba(176,150,118,.22)" d="M0 128 L120 122 C 170 120, 200 132, 230 150 L240 160 L0 160 Z" />
    <path fill="rgba(74,127,193,.26)" d="M0 156 C 200 150, 400 158, 600 152 C 760 148, 880 154, 1000 150 L1000 190 L0 190 Z" />
    <path fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.4" strokeLinecap="round" d="M280 166 q 12 -6 24 0 t 24 0 M520 174 q 12 -6 24 0 t 24 0 M700 162 q 12 -6 24 0 t 24 0 M860 178 q 12 -6 24 0 t 24 0" /></>,
  forest: <>
    <path fill="rgba(60,110,72,.20)" d="M0 140 C 140 118, 260 128, 380 132 C 520 136, 620 112, 760 120 C 860 126, 930 110, 1000 116 L1000 190 L0 190 Z" />
    <path fill="rgba(52,96,64,.32)" d="M0 170 C 160 156, 300 164, 450 166 C 600 168, 720 152, 860 158 C 920 160, 960 154, 1000 156 L1000 190 L0 190 Z" /></>,
  lake: <>
    <path fill="rgba(107,145,96,.16)" d="M0 146 C 140 120, 280 130, 400 138 C 540 146, 640 118, 780 124 C 880 128, 940 114, 1000 118 L1000 190 L0 190 Z" />
    <ellipse cx="560" cy="168" rx="300" ry="20" fill="rgba(74,127,193,.30)" />
    <path fill="none" stroke="rgba(255,255,255,.30)" strokeWidth="1.2" strokeLinecap="round" d="M440 166 h 60 M600 172 h 80 M520 178 h 40" />
    <path fill="rgba(107,145,96,.28)" d="M0 176 C 120 168, 220 172, 280 178 L280 190 L0 190 Z M860 178 C 920 170, 960 168, 1000 170 L1000 190 L840 190 Z" /></>,
  fields: <>
    <path fill="rgba(166,162,62,.18)" d="M0 140 C 200 124, 400 132, 600 128 C 800 124, 900 118, 1000 120 L1000 190 L0 190 Z" />
    <path fill="rgba(107,145,96,.24)" d="M0 156 C 200 146, 420 152, 620 148 C 820 144, 920 142, 1000 144 L1000 190 L0 190 Z" />
    <path fill="rgba(201,168,119,.30)" d="M0 172 C 220 164, 440 170, 660 166 C 840 162, 940 164, 1000 162 L1000 190 L0 190 Z" />
    <path fill="none" stroke="rgba(120,100,60,.22)" strokeWidth="1" d="M0 164 C 220 156, 440 162, 660 158 C 840 154, 940 156, 1000 154 M0 180 C 220 174, 440 178, 660 176 C 840 172, 940 174, 1000 172" /></>,
  city: <>
    <path fill="rgba(107,145,96,.14)" d="M0 160 C 200 150, 400 156, 600 152 C 800 148, 900 150, 1000 148 L1000 190 L0 190 Z" />
    <path fill="rgba(140,150,172,.24)" d="M0 176 C 250 170, 500 174, 750 170 C 880 168, 950 170, 1000 168 L1000 190 L0 190 Z" /></>,
};

/* ---- details: viewBox 0 0 1600 190, keep their shape, standing on the ground near the bottom ---- */
const tree = (x: number, y: number, s = 1, c = 'rgba(70,120,80,.42)') => <g key={`t${x}`} transform={`translate(${x} ${y}) scale(${s})`}>
  <rect x="-1.5" y="-4" width="3" height="10" fill="rgba(110,80,50,.45)" /><circle cy="-12" r="10" fill={c} /></g>;
const pine = (x: number, y: number, s = 1, c = 'rgba(52,96,64,.48)') => <g key={`p${x}`} transform={`translate(${x} ${y}) scale(${s})`}>
  <rect x="-1.5" y="-3" width="3" height="7" fill="rgba(110,80,50,.45)" /><path d="M0 -30 L11 -3 L-11 -3 Z" fill={c} /><path d="M0 -38 L8 -18 L-8 -18 Z" fill={c} /></g>;
const palm = (x: number, y: number, s = 1) => <g key={`m${x}`} transform={`translate(${x} ${y}) scale(${s})`} fill="none" strokeLinecap="round">
  <path d="M0 0 C 2 -14, 4 -26, 2 -40" stroke="rgba(130,95,55,.55)" strokeWidth="3" />
  <path d="M2 -40 C -8 -44, -16 -40, -22 -32 M2 -40 C 12 -46, 20 -42, 26 -34 M2 -40 C -4 -50, -12 -52, -18 -50 M2 -40 C 8 -52, 16 -54, 22 -50" stroke="rgba(90,140,80,.6)" strokeWidth="3" /></g>;
const reed = (x: number, y: number) => <g key={`r${x}`} transform={`translate(${x} ${y})`} stroke="rgba(100,130,80,.55)" strokeWidth="1.6" strokeLinecap="round" fill="none">
  <path d="M0 0 V -18 M5 0 V -24 M10 0 V -16 M-5 0 C -6 -8, -8 -12, -12 -16" /><ellipse cx="5" cy="-27" rx="1.8" ry="5" fill="rgba(130,90,50,.55)" stroke="none" /></g>;
const bale = (x: number, y: number) => <g key={`b${x}`} transform={`translate(${x} ${y})`}><circle cy="-7" r="7" fill="rgba(201,168,119,.55)" /><circle cy="-7" r="3" fill="none" stroke="rgba(150,110,60,.4)" /></g>;
const block = (x: number, w: number, h: number, c: string) => <g key={`k${x}`}>
  <rect x={x} y={186 - h} width={w} height={h} fill={c} />
  {Array.from({ length: Math.floor((h - 10) / 12) }, (_, r) => Array.from({ length: Math.floor((w - 6) / 9) }, (__, q) =>
    <rect key={`${r}-${q}`} x={x + 5 + q * 9} y={186 - h + 7 + r * 12} width="4" height="5" fill="rgba(244,203,93,.30)" />))}</g>;

const DETAILS: Record<SceneId, JSX.Element> = {
  hills: <>{tree(180, 178, 1.1)}{tree(205, 180, .8)}{tree(760, 176, 1.2)}{tree(1150, 178, 1)}{tree(1180, 181, .7)}{tree(1420, 177, 1.1)}</>,
  dunes: <>{palm(260, 182, 1)}{palm(290, 184, .75)}{palm(1240, 182, 1.1)}
    <g fill="none" stroke="rgba(110,140,80,.5)" strokeWidth="5" strokeLinecap="round"><path d="M820 184 V 160 M820 172 h -8 v -8 M820 168 h 8 v -10" /></g></>,
  mountains: <>{pine(140, 182, 1)}{pine(165, 184, .8)}{pine(560, 182, 1.1)}{pine(590, 184, .9)}{pine(1100, 182, 1)}{pine(1380, 183, 1.2)}{pine(1405, 185, .8)}</>,
  coast: <><g transform="translate(1180 160)"><rect x="-6" y="-46" width="12" height="46" fill="rgba(240,240,240,.45)" /><rect x="-6" y="-34" width="12" height="7" fill="rgba(200,80,60,.45)" />
      <rect x="-6" y="-16" width="12" height="7" fill="rgba(200,80,60,.45)" /><path d="M-9 -46 h18 l-4 -8 h-10 Z" fill="rgba(80,80,90,.5)" /><circle cy="-50" r="3" fill="rgba(244,203,93,.7)" /></g>
    <g transform="translate(640 176)"><path d="M-22 0 h44 l-8 8 h-28 Z" fill="rgba(140,100,60,.5)" /><path d="M0 -2 V -30 L18 -4 Z" fill="rgba(240,240,240,.5)" /></g></>,
  forest: <>{Array.from({ length: 30 }, (_, i) => i % 3 === 1 ? tree(30 + i * 53, 184, .9 + (i % 4) * .1, 'rgba(60,110,72,.45)') : pine(30 + i * 53, 185, .8 + (i % 5) * .1))}</>,
  lake: <>{reed(520, 180)}{reed(540, 182)}{reed(1040, 181)}{reed(1060, 183)}{tree(240, 180, 1)}{tree(1340, 179, 1.1)}
    <g transform="translate(860 172)" fill="rgba(240,240,240,.55)"><ellipse rx="9" ry="4" /><circle cx="7" cy="-5" r="3" /></g></>,
  fields: <>{bale(420, 186)}{bale(440, 186)}{bale(980, 186)}{tree(200, 178, 1)}{tree(1300, 178, 1.1)}
    <g transform="translate(700 186)"><rect x="-20" y="-24" width="40" height="24" fill="rgba(180,80,60,.45)" /><path d="M-24 -24 L0 -40 L24 -24 Z" fill="rgba(120,60,50,.5)" /><rect x="-5" y="-14" width="10" height="14" fill="rgba(60,40,30,.4)" /></g></>,
  city: <>{block(330, 34, 46, 'rgba(140,150,172,.40)')}{block(370, 24, 70, 'rgba(120,130,155,.42)')}{block(400, 40, 34, 'rgba(140,150,172,.40)')}
    {block(700, 30, 54, 'rgba(140,150,172,.40)')}{block(736, 22, 82, 'rgba(120,130,155,.42)')}{block(764, 36, 40, 'rgba(140,150,172,.40)')}
    {block(1080, 28, 60, 'rgba(120,130,155,.42)')}{block(1114, 44, 38, 'rgba(140,150,172,.40)')}{block(1164, 26, 92, 'rgba(120,130,155,.42)')}{block(1196, 32, 48, 'rgba(140,150,172,.40)')}</>,
};

/* ---- weather: viewBox 0 0 1000 190, keeps its shape, anchored at the top ---- */
const cloud = (x: number, y: number, s: number, c: string, k: number) => <g key={`c${k}`} className="wcloud" style={{ animationDelay: `-${k * 7}s` }}>
  <g transform={`translate(${x} ${y}) scale(${s})`} fill={c}><ellipse cx="0" cy="0" rx="26" ry="11" /><ellipse cx="-16" cy="4" rx="16" ry="9" /><ellipse cx="18" cy="4" rx="18" ry="9" /><ellipse cx="4" cy="-8" rx="15" ry="11" /></g></g>;
const WEATHER: Record<Weather, JSX.Element> = {
  clear: <g className="wsun"><circle cx="150" cy="28" r="22" fill="rgba(244,203,93,.14)" /><circle cx="150" cy="28" r="13" fill="rgba(250,212,100,.8)" /></g>,
  clouds: <>{cloud(260, 30, 1, 'rgba(200,204,214,.30)', 0)}{cloud(620, 22, 1.3, 'rgba(200,204,214,.34)', 1)}{cloud(860, 40, .9, 'rgba(200,204,214,.28)', 2)}
    <g stroke="rgba(200,204,214,.35)" strokeWidth="1.5" strokeLinecap="round" fill="none"><path d="M120 70 h40 M140 78 h30 M720 62 h44 M740 70 h28" /></g></>,
  storm: <>{cloud(200, 24, 1.3, 'rgba(95,100,118,.55)', 0)}{cloud(480, 18, 1.6, 'rgba(85,90,108,.60)', 1)}{cloud(780, 26, 1.4, 'rgba(95,100,118,.55)', 2)}
    <g stroke="rgba(150,170,200,.5)" strokeWidth="1.5" strokeLinecap="round">{Array.from({ length: 46 }, (_, i) => {
      // each drop falls from under the clouds to the ground, at its own moment, so the rain really falls
      const x = 110 + ((i * 37) % 820), d = ((i * 53) % 100) / 100 * 1.6, s = 1.3 + ((i * 29) % 7) / 10;
      return <path key={i} className="wdrop" style={{ animationDelay: `-${d.toFixed(2)}s`, animationDuration: `${s.toFixed(2)}s` }} d={`M${x} 40 l -3 9`} />;
    })}</g>
    {/* a bolt of lightning under each cloud */}
    <g fill="none" stroke="rgba(244,203,93,.75)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
      <path d="M206 42 l -9 16 h 9 l -7 17" /><path d="M486 40 l -10 18 h 10 l -8 18" /><path d="M790 44 l -9 16 h 9 l -7 16" /></g></>,
  // the setting sun is drawn behind the land (see Scene)
  sunset: <></>,
};

/** Where the horizon is on the right of each landscape (in the 190-high drawing), so the setting sun sits half behind it. */
const HORIZON: Record<SceneId, number> = { hills: 126, dunes: 124, mountains: 114, coast: 152, forest: 120, lake: 128, fields: 126, city: 152 };

/** The land as one solid shape (the terrain is see-through), so a setting sun behind it is hidden. */
function solidLand(scene: SceneId) {
  return Children.toArray((TERRAIN[scene] as ReactElement<{ children: ReactNode }>).props.children)
    .filter((c): c is ReactElement<{ fill?: string }> => isValidElement(c) && (c.props as { fill?: string }).fill !== 'none')
    .map((c, i) => cloneElement(c as ReactElement<Record<string, unknown>>, { key: i, fill: 'var(--land-solid)', stroke: 'none' }));
}

export function Scene({ scene, weather, className = '' }: { scene: SceneId; weather: Weather; className?: string }) {
  return (
    <div className={`scene sky-${weather} ${className}`} aria-hidden="true">
      {weather === 'sunset' && <>
        <span className="sc-sunset" style={{ top: `${(HORIZON[scene] / 190 * 100).toFixed(1)}%` }} />
        <svg className="sc-solid" viewBox="0 0 1000 190" preserveAspectRatio="none">{solidLand(scene)}</svg></>}
      <svg className="sc-terrain" viewBox="0 0 1000 190" preserveAspectRatio="none">{TERRAIN[scene]}</svg>
      <svg className="sc-detail" viewBox="0 0 1600 190" preserveAspectRatio="xMidYMax slice">{DETAILS[scene]}</svg>
      <svg className="sc-weather" viewBox="0 0 1000 190" preserveAspectRatio="xMidYMin slice">{WEATHER[weather]}</svg>
    </div>);
}

/** A small preview of a scene, for the goal form. */
export function SceneThumb({ scene }: { scene: SceneId }) {
  return <Scene scene={scene} weather="clear" className="thumb" />;
}
