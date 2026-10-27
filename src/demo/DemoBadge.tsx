import { useState } from 'react';
import { flyOne, flyV } from '../lib/geese';
import { resetDemo } from './client';
import { setVariant, useVariant, type GoalIcon, type ProjectStyle } from '../lib/variants';

/** Prototype only: a small goose button with what this page is and a way to start again. */
export function DemoBadge() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const projectStyle = useVariant('projectStyle'), goalIcon = useVariant('goalIcon');
  const seg = <T extends string>(k: 'projectStyle' | 'goalIcon', cur: T, opts: [T, string][]) =>
    <span className="seg" role="group">{opts.map(([v, l]) => <button key={v} className={cur === v ? 'on' : ''} aria-pressed={cur === v} onClick={() => setVariant(k, v as never)}>{l}</button>)}</span>;
  if (!open) return (
    <button className="demobtn" title="Prototype: sample data" aria-label="About this prototype" onClick={() => setOpen(true)}>
      <img src={`${import.meta.env.BASE_URL}goose.png`} alt="" /></button>);
  return (
    <div className="demobox" role="dialog" aria-label="About this prototype">
      <div className="demohead"><b>Prototype</b><button className="iconbtn" aria-label="Close" onClick={() => { setOpen(false); setConfirm(false); }}>×</button></div>
      <p className="hint">The same Goose as the live app, with sample data kept in this browser. Nothing you do here reaches the live Goose.</p>
      <div className="demosw"><b>Design options to compare</b>
        <span className="hint">Project progress (Projects page and each project)</span>
        {seg<ProjectStyle>('projectStyle', projectStyle, [['route', 'Route with its people'], ['bar', 'Bar (live today)']])}
        <span className="hint">Small icon next to each goal (Strategy)</span>
        {seg<GoalIcon>('goalIcon', goalIcon, [['route', 'Mini route'], ['people', 'People V'], ['sevenths', 'Sevenths V (live today)']])}</div>
      <div className="demorow"><button className="btn sm" onClick={flyOne}>One goose</button><button className="btn sm" onClick={flyV}>The V</button></div>
      {confirm
        ? <div className="demorow"><span className="hint">Start again from the sample data?</span>
            <button className="btn sm danger" onClick={resetDemo}>Reset</button><button className="btn sm ghost" onClick={() => setConfirm(false)}>Keep</button></div>
        : <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirm(true)}>Reset sample data</button>}
    </div>);
}
