/**
 * Holidays (per workspace, in one or more calendars kept by admins) and personal days off.
 * Tables from supabase/migrations/20261111200000_holidays.sql. Until that update is run,
 * everything here quietly returns nothing (ready: false).
 */
import { db } from './supabase';
import { COUNTRIES, type RuleDay } from './holidayRules';

export interface HolidayCalendar { id: string; workspace_id: string; name: string; color: string }
export interface Holiday { id: string; workspace_id: string; calendar_id: string; day: string; end_day: string | null; name: string }
export interface DayOff { id: string; workspace_id: string; member_id: string; start_day: string; end_day: string; note: string }
export interface DaysOffData { ready: boolean; calendars: HolidayCalendar[]; holidays: Holiday[]; off: DayOff[] }

export const HOLIDAYS_NEED_UPDATE = 'Holidays and days off need a one-time database update first.';
const missing = (m: string) => /(holiday|days_off)/.test(m) && /(does not exist|schema cache|not find)/i.test(m);

export async function loadDaysOff(ws: string): Promise<DaysOffData> {
  const [c, h, o] = await Promise.all([
    db().from('holiday_calendars').select('*').eq('workspace_id', ws).order('created_at'),
    db().from('holidays').select('*').eq('workspace_id', ws).order('day'),
    db().from('days_off').select('*').eq('workspace_id', ws).order('start_day'),
  ]);
  const err = c.error ?? h.error ?? o.error;
  if (err) { if (missing(err.message)) return { ready: false, calendars: [], holidays: [], off: [] }; throw new Error(err.message); }
  return { ready: true, calendars: c.data as HolidayCalendar[], holidays: h.data as Holiday[], off: o.data as DayOff[] };
}

// ---------------------------------------------------------------- days

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Every day from a to b (inclusive), as YYYY-MM-DD. */
export function eachDay(a: string, b: string): string[] {
  const out: string[] = [], d = new Date(`${a}T12:00:00`), e = new Date(`${b}T12:00:00`);
  for (let i = 0; d <= e && i < 400; i++) { out.push(iso(d)); d.setDate(d.getDate() + 1); }
  return out;
}

export interface HolidayMark { name: string; color: string; calendar: string }
/** Holidays by day, for the calendars this person shows. */
export function holidayMap(data: DaysOffData | null, hiddenCals: string[] = []): Map<string, HolidayMark[]> {
  const m = new Map<string, HolidayMark[]>();
  if (!data) return m;
  for (const h of data.holidays) {
    const cal = data.calendars.find(c => c.id === h.calendar_id);
    if (!cal || hiddenCals.includes(cal.id)) continue;
    for (const d of eachDay(h.day, h.end_day ?? h.day)) m.set(d, [...(m.get(d) ?? []), { name: h.name || cal.name, color: cal.color, calendar: cal.name }]);
  }
  return m;
}
/** Who is off on each day (member ids). */
export function offMap(data: DaysOffData | null): Map<string, DayOff[]> {
  const m = new Map<string, DayOff[]>();
  for (const o of data?.off ?? []) for (const d of eachDay(o.start_day, o.end_day)) m.set(d, [...(m.get(d) ?? []), o]);
  return m;
}

// ---------------------------------------------------------------- saving (from the Save button of each window)

export interface CalendarDraft { id: string; isNew?: boolean; name: string; color: string; days: Holiday[] }

/** Writes the changes between the calendars as loaded and as edited. */
export async function saveCalendars(ws: string, before: CalendarDraft[], after: CalendarDraft[]) {
  const fail = (e: { message: string } | null) => { if (e) throw new Error(missing(e.message) ? HOLIDAYS_NEED_UPDATE : e.message); };
  for (const c of before.filter(b => !after.some(a => a.id === b.id))) fail((await db().from('holiday_calendars').delete().eq('id', c.id)).error);
  for (const c of after) {
    if (c.isNew) fail((await db().from('holiday_calendars').insert({ id: c.id, workspace_id: ws, name: c.name.trim(), color: c.color })).error);
    else {
      const b = before.find(x => x.id === c.id);
      if (b && (b.name !== c.name || b.color !== c.color)) fail((await db().from('holiday_calendars').update({ name: c.name.trim(), color: c.color }).eq('id', c.id)).error);
    }
    const old = before.find(x => x.id === c.id)?.days ?? [];
    const gone = old.filter(o => !c.days.some(d => d.id === o.id)).map(o => o.id);
    if (gone.length) fail((await db().from('holidays').delete().in('id', gone)).error);
    const added = c.days.filter(d => !old.some(o => o.id === d.id));
    if (added.length) fail((await db().from('holidays').insert(added.map(d => ({ id: d.id, workspace_id: ws, calendar_id: c.id, day: d.day, end_day: d.end_day, name: d.name.trim() })))).error);
  }
}

export async function saveDaysOff(ws: string, member: string, before: DayOff[], after: DayOff[]) {
  const fail = (e: { message: string } | null) => { if (e) throw new Error(missing(e.message) ? HOLIDAYS_NEED_UPDATE : e.message); };
  const gone = before.filter(b => !after.some(a => a.id === b.id)).map(b => b.id);
  if (gone.length) fail((await db().from('days_off').delete().in('id', gone)).error);
  const added = after.filter(a => !before.some(b => b.id === a.id));
  if (added.length) fail((await db().from('days_off').insert(added.map(a => ({ id: a.id, workspace_id: ws, member_id: member, start_day: a.start_day, end_day: a.end_day, note: a.note.trim() })))).error);
}

// ---------------------------------------------------------------- official lists to fill in

export interface Preset { id: string; label: string; years: number[]; days: (y: number) => RuleDay[] }
const list = (byYear: Record<number, [string, string][]>) => (y: number): RuleDay[] => (byYear[y] ?? []).map(([day, name]) => ({ day, name }));

/** What a calendar can be filled in with. Madrid: official lists from the Comunidad de Madrid decrees 75/2025
    (BOCM 25 Sep 2025) and 82/2026 (BOCM 1 Oct 2026) and the Ayuntamiento's two local days. Countries: national
    holidays worked out in holidayRules.ts. */
export const PRESETS: Preset[] = [
  { id: 'es-md', label: 'Comunidad de Madrid (Spain)', years: [2026, 2027], days: list({
    2026: [['2026-01-01', 'Año Nuevo'], ['2026-01-06', 'Epifanía del Señor'], ['2026-04-02', 'Jueves Santo'], ['2026-04-03', 'Viernes Santo'],
      ['2026-05-01', 'Fiesta del Trabajo'], ['2026-05-02', 'Fiesta de la Comunidad de Madrid'], ['2026-08-15', 'Asunción de la Virgen'],
      ['2026-10-12', 'Fiesta Nacional de España'], ['2026-11-02', 'Todos los Santos (traslado)'], ['2026-12-07', 'Día de la Constitución (traslado)'],
      ['2026-12-08', 'Inmaculada Concepción'], ['2026-12-25', 'Natividad del Señor']],
    2027: [['2027-01-01', 'Año Nuevo'], ['2027-01-06', 'Epifanía del Señor'], ['2027-03-19', 'San José'], ['2027-03-25', 'Jueves Santo'],
      ['2027-03-26', 'Viernes Santo'], ['2027-05-01', 'Fiesta del Trabajo'], ['2027-08-16', 'Asunción de la Virgen (traslado)'],
      ['2027-10-12', 'Fiesta Nacional de España'], ['2027-11-01', 'Todos los Santos'], ['2027-12-06', 'Día de la Constitución'],
      ['2027-12-08', 'Inmaculada Concepción'], ['2027-12-25', 'Natividad del Señor']],
  }) },
  { id: 'madrid-city', label: 'Madrid city (two local days)', years: [2026, 2027], days: list({
    2026: [['2026-05-15', 'San Isidro Labrador'], ['2026-11-09', 'Nuestra Señora de la Almudena']],
    2027: [['2027-05-15', 'San Isidro Labrador'], ['2027-11-09', 'Nuestra Señora de la Almudena']],
  }) },
  ...COUNTRIES,
];
/** The calendar name a preset suggests: "Germany (nationwide)" → "Germany". */
export const presetName = (p: Preset) => p.label.replace(/ \(.*\)$/, '');

export const CAL_COLORS = ['#D0453A', '#E08A2E', '#C9A227', '#5D8C4A', '#2F8F83', '#4A7FC1', '#8E5CC2', '#B5527A'];
