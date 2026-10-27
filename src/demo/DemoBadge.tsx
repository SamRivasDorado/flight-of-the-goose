import { useState } from 'react';
import { flyOne, flyV } from '../lib/geese';
import { resetDemo } from './client';

/** Prototype only: a small goose button with what this page is and a way to start again. */
export function DemoBadge() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (!open) return (
    <button className="demobtn" title="Prototype: sample data" aria-label="About this prototype" onClick={() => setOpen(true)}>
      <img src={`${import.meta.env.BASE_URL}goose.png`} alt="" /></button>);
  return (
    <div className="demobox" role="dialog" aria-label="About this prototype">
      <div className="demohead"><b>Prototype</b><button className="iconbtn" aria-label="Close" onClick={() => { setOpen(false); setConfirm(false); }}>×</button></div>
      <p className="hint">The same Goose as the live app, with sample data kept in this browser. Nothing you do here reaches the live Goose.</p>
      <div className="demorow"><button className="btn sm" onClick={flyOne}>One goose</button><button className="btn sm" onClick={flyV}>The V</button></div>
      {confirm
        ? <div className="demorow"><span className="hint">Start again from the sample data?</span>
            <button className="btn sm danger" onClick={resetDemo}>Reset</button><button className="btn sm ghost" onClick={() => setConfirm(false)}>Keep</button></div>
        : <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirm(true)}>Reset sample data</button>}
    </div>);
}
