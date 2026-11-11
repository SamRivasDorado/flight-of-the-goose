import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspace } from '../auth/session';
import { useLocalPref } from '../lib/ui';
import type { Member } from '../lib/types';
import { CAL_COLORS, HOLIDAYS_NEED_UPDATE, PRESETS, saveCalendars, saveDaysOff, type CalendarDraft, type DayOff, type DaysOffData, type Holiday } from '../lib/holidays';
import { Icon } from './Logo';

const fmt = (d: string, year = true) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
const span = (a: string, b: string | null) => (b && b !== a ? `${fmt(a, a.slice(0, 4) !== b.slice(0, 4))} – ${fmt(b)}` : fmt(a));

/** Calendars this person has switched off in their own Calendar and Timeline (shared by both). */
export const useHiddenCalendars = () => useLocalPref<string[]>('hiddenCals', []);

function Modal({ title, wide, onClose, children, foot }: { title: string; wide?: boolean; onClose: () => void; children: React.ReactNode; foot: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label={title} style={wide ? { width: 'min(760px,100%)' } : undefined}><h2>{title}</h2>
        <div className="mbody">{children}</div>
        <div className="mfoot">{foot}</div>
      </div>
    </div>, document.body);
}

/** Holidays of the workspace: one or more calendars, each with its days. Admins edit; everyone can look. */
export function HolidaysDialog({ data, onClose, onSaved }: { data: DaysOffData; onClose: () => void; onSaved: () => void }) {
  const ws = useWorkspace();
  const admin = ws.access === 'admin';
  const before = useMemo<CalendarDraft[]>(() => data.calendars.map(c => ({ id: c.id, name: c.name, color: c.color, days: data.holidays.filter(h => h.calendar_id === c.id) })), [data]);
  const [cals, setCals] = useState<CalendarDraft[]>(before);
  const [sel, setSel] = useState<string | null>(before[0]?.id ?? null);
  const [hiddenCals, setHiddenCals] = useHiddenCalendars();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preset, setPreset] = useState(PRESETS[0].id);
  const [year, setYear] = useState(() => String(Math.min(2027, Math.max(2026, new Date().getFullYear()))));
  const [add, setAdd] = useState({ day: '', end: '', name: '' });
  const cal = cals.find(c => c.id === sel) ?? null;
  const setCal = (p: Partial<CalendarDraft>) => setCals(cs => cs.map(c => (c.id === sel ? { ...c, ...p } : c)));
  const dayRow = (d: string, name: string, end: string | null = null): Holiday => ({ id: crypto.randomUUID(), workspace_id: ws.workspace_id, calendar_id: sel!, day: d, end_day: end, name });

  function newCal() {
    const c: CalendarDraft = { id: crypto.randomUUID(), isNew: true, name: cals.length ? 'New calendar' : 'Holidays', color: CAL_COLORS[cals.length % CAL_COLORS.length], days: [] };
    setCals(cs => [...cs, c]); setSel(c.id);
  }
  function fill() {
    if (!cal) return;
    const list = PRESETS.find(p => p.id === preset)?.years[Number(year)] ?? [];
    const fresh = list.filter(([d]) => !cal.days.some(x => x.day === d)).map(([d, n]) => dayRow(d, n));
    setCal({ days: [...cal.days, ...fresh] });
    setErr(fresh.length ? null : 'Those days are already in this calendar.');
  }
  function addDay() {
    if (!cal || !add.day) { setErr('Choose a date first.'); return; }
    if (add.end && add.end < add.day) { setErr('The last day comes before the first.'); return; }
    setCal({ days: [...cal.days, dayRow(add.day, add.name.trim(), add.end || null)] }); setAdd({ day: '', end: '', name: '' }); setErr(null);
  }
  async function save() {
    if (cals.some(c => !c.name.trim())) { setErr('Give every calendar a name.'); return; }
    setBusy(true); setErr(null);
    try { await saveCalendars(ws.workspace_id, before, cals); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  const years = cal ? [...new Set(cal.days.map(d => d.day.slice(0, 4)))].sort() : [];
  return (
    <Modal title="Holidays" wide onClose={onClose} foot={<>
      {err && <span className="err">{err}</span>}<span className="grow" />
      {admin ? <><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !data.ready} onClick={() => void save()}><Icon name="check" />Save</button></>
        : <button className="btn" onClick={onClose}>Close</button>}</>}>
      {!data.ready ? <span className="hint">{HOLIDAYS_NEED_UPDATE}</span> : <>
        <span className="hint">The holidays of this workspace, tinted in the Calendar and on the Timeline so nobody plans work or meetings on them.{admin ? '' : ' Admins keep them.'}</span>
        <div className="calpick">
          {cals.map(c => <button key={c.id} className={`calsel ${c.id === sel ? 'on' : ''}`} onClick={() => setSel(c.id)}>
            <i style={{ background: c.color }} />{c.name || 'Untitled'}<span className="muted">{c.days.length}</span></button>)}
          {admin && <button className="btn sm ghost" onClick={newCal}><Icon name="plus" />New calendar</button>}
        </div>
        {!cal && <span className="hint">{admin ? 'No holiday calendar yet. Create one, then fill it in with the official holidays or add your own days.' : 'No holidays yet.'}</span>}
        {cal && <>
          {admin && <div className="row" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><label className="lbl" htmlFor="hc-name">Name</label>
              <input id="hc-name" className="field-in" style={{ width: '100%' }} value={cal.name} maxLength={60} onChange={e => setCal({ name: e.target.value })} placeholder="Comunidad de Madrid" /></div>
            <div><span className="lbl">Colour</span><div className="swatches">{CAL_COLORS.map(c =>
              <button key={c} type="button" className={`swt ${cal.color.toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style={{ ['--c' as string]: c }} aria-label={`Colour ${c}`} onClick={() => setCal({ color: c })} />)}</div></div>
          </div>}
          <label className="chk"><input type="checkbox" checked={!hiddenCals.includes(cal.id)}
            onChange={e => setHiddenCals(e.target.checked ? hiddenCals.filter(x => x !== cal.id) : [...hiddenCals, cal.id])} />Show in my Calendar and Timeline</label>
          {admin && <div className="holfill">
            <span className="lbl">Fill in official holidays</span>
            <div className="row">
              <select className="field-in" value={preset} onChange={e => setPreset(e.target.value)}>{PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
              <select className="field-in" value={year} onChange={e => setYear(e.target.value)}>{Object.keys(PRESETS.find(p => p.id === preset)!.years).map(y => <option key={y}>{y}</option>)}</select>
              <button className="btn sm" onClick={fill}><Icon name="plus" />Fill in</button></div>
            <span className="hint">Official lists for 2026 and 2027. For other places and years, add the days below.</span>
          </div>}
          <div className="hollist">
            {years.map(y => <div key={y}><div className="holyear">{y}</div>
              {cal.days.filter(d => d.day.startsWith(y)).sort((a, b) => a.day.localeCompare(b.day)).map(d => (
                <div key={d.id} className="holrow"><span className="hd">{span(d.day, d.end_day)}</span><span className="hn">{d.name}</span>
                  {admin && <button className="iconbtn" aria-label={`Remove ${d.name || d.day}`} onClick={() => setCal({ days: cal.days.filter(x => x.id !== d.id) })}><Icon name="x" /></button>}</div>))}
            </div>)}
            {!cal.days.length && <span className="hint">No days in this calendar yet.</span>}
          </div>
          {admin && <div className="holadd">
            <span className="lbl">Add a day or a period</span>
            <div className="row">
              <input type="date" className="field-in" aria-label="First day" value={add.day} onChange={e => setAdd(a => ({ ...a, day: e.target.value }))} />
              <span className="muted">to</span>
              <input type="date" className="field-in" aria-label="Last day (optional)" value={add.end} min={add.day || undefined} onChange={e => setAdd(a => ({ ...a, end: e.target.value }))} />
              <input className="field-in" style={{ flex: 1, minWidth: 140 }} placeholder="Office closed" value={add.name} maxLength={80} onChange={e => setAdd(a => ({ ...a, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') addDay(); }} />
              <button className="btn sm" onClick={addDay}><Icon name="plus" />Add</button></div>
          </div>}
          {admin && <div><button className="btn sm ghost" onClick={() => { setCals(cs => cs.filter(c => c.id !== sel)); setSel(cals.find(c => c.id !== sel)?.id ?? null); }}>
            <Icon name="trash" />Remove this calendar</button></div>}
        </>}
      </>}
    </Modal>);
}

/** A person's days off. They edit their own; admins anyone's. */
export function DaysOffDialog({ member, data, canEdit, onClose, onSaved }: { member: Member; data: DaysOffData; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const ws = useWorkspace();
  const before = useMemo(() => data.off.filter(o => o.member_id === member.id), [data, member.id]);
  const [list, setList] = useState<DayOff[]>(before);
  const [add, setAdd] = useState({ from: '', to: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  function addOne() {
    if (!add.from) { setErr('Choose the first day.'); return; }
    const to = add.to || add.from;
    if (to < add.from) { setErr('The last day comes before the first.'); return; }
    setList(l => [...l, { id: crypto.randomUUID(), workspace_id: ws.workspace_id, member_id: member.id, start_day: add.from, end_day: to, note: add.note.trim() }]);
    setAdd({ from: '', to: '', note: '' }); setErr(null);
  }
  async function save() {
    setBusy(true); setErr(null);
    try { await saveDaysOff(ws.workspace_id, member.id, before, list); onSaved(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }
  const mine = member.id === ws.member_id;
  const sorted = [...list].sort((a, b) => a.start_day.localeCompare(b.start_day));
  return (
    <Modal title={mine ? 'Your days off' : `Days off · ${member.display_name}`} onClose={onClose} foot={<>
      {err && <span className="err">{err}</span>}<span className="grow" />
      {canEdit ? <><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !data.ready} onClick={() => void save()}><Icon name="check" />Save</button></>
        : <button className="btn" onClick={onClose}>Close</button>}</>}>
      {!data.ready ? <span className="hint">{HOLIDAYS_NEED_UPDATE}</span> : <>
        <span className="hint">Holidays, conferences, any time away. Everyone in the workspace sees them in the Calendar, so nobody plans work for {mine ? 'you' : member.display_name} on those days.</span>
        <div className="hollist">
          {sorted.map(o => <div key={o.id} className={`holrow ${o.end_day < today ? 'past' : ''}`}><span className="hd">{span(o.start_day, o.end_day)}</span><span className="hn">{o.note}</span>
            {canEdit && <button className="iconbtn" aria-label="Remove" onClick={() => setList(l => l.filter(x => x.id !== o.id))}><Icon name="x" /></button>}</div>)}
          {!sorted.length && <span className="hint">No days off yet.</span>}
        </div>
        {canEdit && <div className="holadd"><span className="lbl">Add days off</span>
          <div className="row">
            <input type="date" className="field-in" aria-label="First day" value={add.from} onChange={e => setAdd(a => ({ ...a, from: e.target.value }))} />
            <span className="muted">to</span>
            <input type="date" className="field-in" aria-label="Last day" value={add.to} min={add.from || undefined} onChange={e => setAdd(a => ({ ...a, to: e.target.value }))} />
            <input className="field-in" style={{ flex: 1, minWidth: 140 }} placeholder="Holiday" value={add.note} maxLength={120} onChange={e => setAdd(a => ({ ...a, note: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') addOne(); }} />
            <button className="btn sm" onClick={addOne}><Icon name="plus" />Add</button></div>
        </div>}
      </>}
    </Modal>);
}
