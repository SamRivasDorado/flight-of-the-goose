import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { describe, isoDow, nextDue, presetOf, presets, type Repeat, type RepeatUnit } from '../lib/repeat';
import { todayISO } from '../lib/data';
import { Icon } from './Logo';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const fmt = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** The Repeat choice in the task panel: quick choices, or a custom rule set in a small dialog. */
export function RepeatField({ rule, due, done, disabled, onChange }: { rule: Repeat | null; due: string | null; done: boolean; disabled: boolean; onChange: (r: Repeat | null) => void }) {
  const [editing, setEditing] = useState(false);
  const cur = presetOf(rule, due), quick = presets(due);
  // before: the next date if it is done on time (or today, if late); once done: the date of the one just created
  const next = rule ? nextDue(rule, due, !done && due && due > todayISO() ? due : todayISO()) : null;
  function pick(v: string) {
    if (v === 'none') onChange(null);
    else if (v === 'custom') setEditing(true);
    else onChange(quick.find(q => q[0] === v)![2]);
  }
  return (
    <div className="repf">
      <div className="repf-row">
        <select id="d-rep" className="field-in" disabled={disabled || done} value={cur} title={rule ? describe(rule, due) : undefined} onChange={e => pick(e.target.value)}>
          <option value="none">Doesn’t repeat</option>
          {quick.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          <option value="custom">{cur === 'custom' && rule ? describe(rule, due) : 'Custom…'}</option></select>
        {rule && !disabled && !done && <button type="button" className="iconbtn" onClick={() => setEditing(true)} aria-label="Change how it repeats" title="Change how it repeats"><Icon name="gear" /></button>}
      </div>
      {rule && <div className="muted repf-next">{done
        ? (next ? 'Completed: the next one is in your tasks.' : 'Completed: this was the last one.')
        : next ? <>When this is done, the next one is created, due <b>{fmt(next)}</b>.</> : 'This is the last one: no more will be created.'}</div>}
      {editing && createPortal(<RepeatDialog rule={rule} due={due} onClose={() => setEditing(false)} onSave={r => { onChange(r); setEditing(false); }} />, document.body)}
    </div>);
}

/** Custom repeat: every N days/weeks/months/years, which weekdays, counted from the due date or completion, and when to stop. */
function RepeatDialog({ rule, due, onClose, onSave }: { rule: Repeat | null; due: string | null; onClose: () => void; onSave: (r: Repeat) => void }) {
  const base = new Date(`${due ?? todayISO()}T12:00:00`);
  const [r, setR] = useState<Repeat>(() => rule ?? { unit: 'week', every: 1, days: [isoDow(base)], from: 'due' });
  const [ends, setEnds] = useState<'never' | 'on' | 'after'>(rule?.until ? 'on' : rule?.left != null ? 'after' : 'never');
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<Repeat>) => { setR(x => ({ ...x, ...p })); setErr(null); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    addEventListener('keydown', k, true); return () => removeEventListener('keydown', k, true);
  }, [onClose]);
  const final = (): Repeat | null => {
    const out: Repeat = { unit: r.unit, every: r.unit === 'weekday' ? 1 : Math.max(1, Math.min(99, Math.round(r.every || 1))), from: r.from };
    if (r.unit === 'week') out.days = r.days?.length ? r.days : [isoDow(base)];
    if (r.unit === 'month') out.dom = Math.max(1, Math.min(31, Math.round(r.dom ?? base.getDate())));
    if (ends === 'on') { if (!r.until) { setErr('Choose the date it stops.'); return null; } out.until = r.until; }
    if (ends === 'after') out.left = Math.max(1, Math.min(999, Math.round(r.left ?? 5)));
    return out;
  };
  const preview = (() => { const f = { ...r, ...(ends === 'on' ? {} : { until: null }), ...(ends === 'after' ? { left: r.left ?? 5 } : { left: null }) }; return describe(f as Repeat, due); })();
  const units: [RepeatUnit, string][] = [['day', r.every > 1 ? 'days' : 'day'], ['weekday', 'weekday (Mon–Fri)'], ['week', r.every > 1 ? 'weeks' : 'week'], ['month', r.every > 1 ? 'months' : 'month'], ['year', r.every > 1 ? 'years' : 'year']];
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="Repeat" style={{ width: 'min(480px, calc(100vw - 32px))' }}>
        <h2>Repeat</h2>
        <div className="mbody">
          <div><span className="lbl">Every</span>
            <div className="repf-row">
              {r.unit !== 'weekday' && <input type="number" min={1} max={99} className="field-in" style={{ width: 72 }} aria-label="Every how many" value={r.every}
                onChange={e => set({ every: Number(e.target.value) || 1 })} />}
              <select className="field-in" aria-label="Unit" value={r.unit} onChange={e => set({ unit: e.target.value as RepeatUnit })}>
                {units.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div></div>
          {r.unit === 'week' && <div><span className="lbl">On</span>
            <div className="pplpick">{DOW.map((l, i) => { const on = (r.days ?? []).includes(i + 1); return (
              <button key={l} type="button" className={`pp ${on ? 'on' : ''}`} aria-pressed={on}
                onClick={() => set({ days: on ? (r.days ?? []).filter(x => x !== i + 1) : [...(r.days ?? []), i + 1] })}>{l}</button>); })}</div></div>}
          {r.unit === 'month' && <div><label className="lbl" htmlFor="rp-dom">On day</label>
            <input id="rp-dom" type="number" min={1} max={31} className="field-in" style={{ width: 72 }} value={r.dom ?? base.getDate()} onChange={e => set({ dom: Number(e.target.value) || 1 })} />
            <div className="hint">In shorter months, days after the last one fall on the last day.</div></div>}
          <div className="repends"><span className="lbl">Count from</span>
            <label className="chk"><input type="radio" name="rp-from" checked={r.from === 'due'} onChange={() => set({ from: 'due' })} />The due date: a fixed schedule, whenever it is done</label>
            <label className="chk"><input type="radio" name="rp-from" checked={r.from === 'done'} onChange={() => set({ from: 'done' })} />The day it is done: for example, two weeks after the last one</label></div>
          <div className="repends"><span className="lbl">Ends</span>
            <label className="chk"><input type="radio" name="rp-end" checked={ends === 'never'} onChange={() => setEnds('never')} />Never</label>
            <label className="chk"><input type="radio" name="rp-end" checked={ends === 'on'} onChange={() => setEnds('on')} />On
              <input type="date" className="field-in" aria-label="Ends on" value={r.until ?? ''} onFocus={() => setEnds('on')} onChange={e => { setEnds('on'); set({ until: e.target.value || null }); }} /></label>
            <label className="chk"><input type="radio" name="rp-end" checked={ends === 'after'} onChange={() => setEnds('after')} />After
              <input type="number" min={1} max={999} className="field-in" style={{ width: 72 }} aria-label="How many times" value={r.left ?? 5}
                onFocus={() => setEnds('after')} onChange={e => { setEnds('after'); set({ left: Number(e.target.value) || 1 }); }} /> times, this one included</label></div>
          <div className="hint"><Icon name="repeat" /> {preview}</div>
        </div>
        <div className="mfoot">{err && <span className="err">{err}</span>}<span className="grow" />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { const f = final(); if (f) onSave(f); }}>Save</button></div>
      </div>
    </div>);
}
