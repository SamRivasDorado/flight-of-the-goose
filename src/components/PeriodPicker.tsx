import { PERIODS, rangeLabel, shiftPeriod, type Period } from '../lib/period';
import { Icon } from './Logo';

/** The period control shared by Review and Insights: arrows to step back and forward, the choices, and the dates
    (editable when "Choose dates…" is picked, or after stepping with the arrows). */
export function PeriodPicker({ p, r, onChange }: { p: Period; r: { from: string; to: string }; onChange: (p: Period) => void }) {
  const set = (kind: Period['kind']) => onChange(kind === 'custom' ? { kind, from: r.from, to: r.to } : { kind });
  const dates = (from: string, to: string) => onChange({ kind: 'custom', from, to });
  return (
    <div className="periodbar">
      <button className="iconbtn" disabled={p.kind === 'all'} onClick={() => onChange(shiftPeriod(p, r, -1))} aria-label="Previous period" title="Previous period"><Icon name="left" /></button>
      <select className="field-in" aria-label="Period" value={p.kind} onChange={e => set(e.target.value as Period['kind'])}>
        {PERIODS.map(([k, l]) => <option key={k} value={k}>{k === 'custom' && p.kind === 'custom' ? 'Chosen dates' : l}</option>)}</select>
      <button className="iconbtn" disabled={p.kind === 'all'} onClick={() => onChange(shiftPeriod(p, r, 1))} aria-label="Next period" title="Next period"><Icon name="right" /></button>
      {p.kind === 'custom'
        ? <span className="pdates"><input type="date" className="field-in" aria-label="From" value={r.from} onChange={e => e.target.value && dates(e.target.value, e.target.value > r.to ? e.target.value : r.to)} />
            <span className="muted">to</span>
            <input type="date" className="field-in" aria-label="To" value={r.to} onChange={e => e.target.value && dates(e.target.value < r.from ? e.target.value : r.from, e.target.value)} /></span>
        : <span className="mono muted">{rangeLabel(r)}</span>}
    </div>);
}
