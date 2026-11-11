import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspace } from '../auth/session';
import { useLocalPref } from '../lib/ui';
import type { Member } from '../lib/types';
import { CAL_COLORS, HOLIDAYS_NEED_UPDATE, PRESETS, presetName, saveCalendars, saveDaysOff, type CalendarDraft, type DayOff, type DaysOffData, type Holiday } from '../lib/holidays';
import { Icon } from './Logo';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parts = (d: string) => { const x = new Date(`${d}T12:00:00`); return { wd: WD[x.getDay()], d: x.getDate(), m: MO[x.getMonth()], y: x.getFullYear() }; };
/** "Fri 25 Dec 2026", or a period: "Mon 21 – Thu 24 Dec 2026", "Mon 28 Dec 2026 – Fri 1 Jan 2027". */
function span(a: string, b: string | null, year = true) {
  const p = parts(a), q = b && b !== a ? parts(b) : null, y = (x: { y: number }) => (year ? ` ${x.y}` : '');
  if (!q) return `${p.wd} ${p.d} ${p.m}${y(p)}`;
  if (p.y !== q.y) return `${p.wd} ${p.d} ${p.m} ${p.y} – ${q.wd} ${q.d} ${q.m} ${q.y}`;
  return p.m === q.m ? `${p.wd} ${p.d} – ${q.wd} ${q.d} ${q.m}${y(q)}` : `${p.wd} ${p.d} ${p.m} – ${q.wd} ${q.d} ${q.m}${y(q)}`;
}

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
  const [year, setYear] = useState(() => String(Math.max(2026, new Date().getFullYear())));
  const pre = PRESETS.find(p => p.id === preset)!;
  const yearOk = pre.years.includes(Number(year)) ? year : String(pre.years[0]);
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
    const fresh = pre.days(Number(yearOk)).filter(r => !cal.days.some(x => x.day === r.day && x.name === r.name)).map(r => dayRow(r.day, r.name, r.end ?? null));
    // an empty calendar that still has its starting name takes the place's name
    const rename = !cal.days.length && ['New calendar', 'Holidays', ''].includes(cal.name.trim());
    setCal({ days: [...cal.days, ...fresh], ...(rename ? { name: presetName(pre) } : {}) });
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
              <select className="field-in" value={yearOk} onChange={e => setYear(e.target.value)}>{pre.years.map(y => <option key={y}>{y}</option>)}</select>
              <button className="btn sm" onClick={fill}><Icon name="plus" />Fill in</button></div>
            <span className="hint">National public holidays (regional ones are not included). Islamic holidays follow the moon: their dates are the expected ones and may move by a day once announced. For other places and years, add the days below.</span>
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

/** Team → Holidays: every calendar of the workspace for a year, and what is coming up (holidays and people away). */
export function HolidaysOverview({ data, people, admin, onEdit, onDaysOff }: {
  data: DaysOffData; people: Member[]; admin: boolean; onEdit: () => void; onDaysOff: (m: Member) => void;
}) {
  const [hiddenCals, setHiddenCals] = useHiddenCalendars();
  const now = new Date(), today = now.toISOString().slice(0, 10);
  const soon = new Date(now); soon.setDate(soon.getDate() + 30); const until = soon.toISOString().slice(0, 10);
  const years = [...new Set([now.getFullYear(), ...data.holidays.map(h => Number(h.day.slice(0, 4)))])].sort();
  const [year, setYear] = useState(now.getFullYear());
  if (!data.ready) return <div className="empty">{HOLIDAYS_NEED_UPDATE}</div>;
  const calOf = (id: string) => data.calendars.find(c => c.id === id);
  const coming = data.holidays.filter(h => (h.end_day ?? h.day) >= today && h.day <= until).sort((a, b) => a.day.localeCompare(b.day));
  const away = data.off.filter(o => o.end_day >= today && o.start_day <= until && people.some(m => m.id === o.member_id)).sort((a, b) => a.start_day.localeCompare(b.start_day));
  return (
    <div className="holview">
      <div className="holbar">
        <select className="field-in" aria-label="Year" value={year} onChange={e => setYear(Number(e.target.value))}>{years.map(y => <option key={y}>{y}</option>)}</select>
        <span className="grow" />
        {admin && <button className="btn" onClick={onEdit}><Icon name="edit" />Edit holidays</button>}
      </div>
      <section className="holsoon">
        <div className="h3 gsect">Next 30 days</div>
        {[...coming.map(h => ({ k: h.id, d: h.day, node: (() => { const c = calOf(h.calendar_id); return (
            <div key={h.id} className="holrow"><span className="hd">{span(h.day, h.end_day)}</span><span className="hn">{h.name}</span>
              {c && <span className="calsel sm"><i style={{ background: c.color }} />{c.name}</span>}</div>); })() })),
          ...away.map(o => ({ k: o.id, d: o.start_day < today ? today : o.start_day, node: (() => { const m = people.find(x => x.id === o.member_id)!; return (
            <div key={o.id} className="holrow"><span className="hd">{span(o.start_day, o.end_day)}</span>
              <span className="hn"><b>{m.display_name}</b> away{o.note ? ` · ${o.note}` : ''}</span>
              <button className="linkbtn" onClick={() => onDaysOff(m)}>Days off</button></div>); })() }))]
          .sort((a, b) => a.d.localeCompare(b.d)).map(x => x.node)}
        {!coming.length && !away.length && <span className="hint">No holidays and nobody away in the next 30 days.</span>}
      </section>
      <div className="holcards">
        {data.calendars.map(c => { const days = data.holidays.filter(h => h.calendar_id === c.id && h.day.startsWith(String(year))).sort((a, b) => a.day.localeCompare(b.day)); return (
          <article key={c.id} className="holcard" style={{ ['--c' as string]: c.color }}>
            <header><i /><b>{c.name}</b><span className="muted">{days.length}</span><span className="grow" />
              <label className="chk" title="Show this calendar's holidays in my Calendar"><input type="checkbox" checked={!hiddenCals.includes(c.id)}
                onChange={e => setHiddenCals(e.target.checked ? hiddenCals.filter(x => x !== c.id) : [...hiddenCals, c.id])} />In my Calendar</label></header>
            <div className="hcl">{days.map(d => <div key={d.id} className={`holrow ${(d.end_day ?? d.day) < today ? 'past' : ''}`}>
              <span className="hd">{span(d.day, d.end_day, false)}</span><span className="hn">{d.name}</span></div>)}
              {!days.length && <span className="hint">No days in {year}.</span>}</div>
          </article>); })}
      </div>
      {!data.calendars.length && <div className="empty">{admin ? 'No holidays yet. Edit holidays to add a calendar for each place the company works in.' : 'No holidays yet.'}</div>}
    </div>);
}
