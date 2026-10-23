import { useEffect, useState } from 'react';
import { useWorkspace } from '../auth/session';
import { addOption, createDim, deleteDim, deleteOption, renameDim, updateOption } from '../lib/data';
import { useLens } from '../lib/lens';
import { useUI } from '../lib/ui';
import type { Dim } from '../lib/types';
import { Icon } from './Logo';
import { TEAM_COLORS } from './TeamDialogs';

/** Edit the shared dimensions (Priority, Region, …): names, options and colours. Changes save as you go. */
export function DimensionsDialog({ onClose }: { onClose: () => void }) {
  const ws = useWorkspace();
  const lens = useLens();
  const ui = useUI();
  const [colorFor, setColorFor] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<Dim | null>(null);
  const [nf, setNf] = useState({ name: '', opts: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  async function run(fn: () => Promise<unknown>) {
    try { setErr(null); setBusy(true); await fn(); await lens.reload(); ui.changed(); return true; }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); return false; }
    finally { setBusy(false); }
  }
  async function create() {
    const name = nf.name.trim();
    if (!name) { setErr('Give the dimension a name, for example Region.'); return; }
    if (lens.dims.some(d => d.name.toLowerCase() === name.toLowerCase())) { setErr(`There is already a dimension called ${name}.`); return; }
    const labels = nf.opts.split(',').map(x => x.trim()).filter(Boolean);
    if (await run(() => createDim(ws.workspace_id, name, labels.map((label, i) => ({ label, color: TEAM_COLORS[(i + 3) % TEAM_COLORS.length] })), lens.dims.length))) setNf({ name: '', opts: '' });
  }

  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="Dimensions">
        <h2>Dimensions</h2>
        <div className="mbody">
          <div className="hint">Dimensions are shared labels that work everywhere: on every task, as project defaults, in the Lens at the top and in charts. Rename a dimension or an option by editing its text; click a colour dot to change it.</div>
          {lens.dims.map(d => (
            <div key={d.id} className="dimbox">
              <div className="dimhead">
                <input className="field-in dimname" defaultValue={d.name} aria-label="Dimension name"
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== d.name) void run(() => renameDim(d.id, v)); else e.target.value = d.name; }} />
                {d.builtin ? <span className="tag" title="Every workspace has this dimension">Built in</span>
                  : <button className="iconbtn" aria-label={`Delete ${d.name}`} title="Delete dimension" onClick={() => setConfirmDel(d)}><Icon name="trash" /></button>}
              </div>
              <div className="optlist">
                {d.options.map(o => { const open = colorFor === o.id; return (
                  <div key={o.id}>
                    <div className="optrow">
                      <button className={`optsw ${open ? 'on' : ''}`} style={{ ['--c' as string]: o.color }} aria-label={`Change colour of ${o.label}`} aria-expanded={open}
                        onClick={() => setColorFor(open ? null : o.id)} />
                      <input className="field-in" defaultValue={o.label} aria-label="Option name"
                        onBlur={e => { const v = e.target.value.trim(); if (v && v !== o.label) void run(() => updateOption(o.id, { label: v })); else e.target.value = o.label; }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                      <button className="iconbtn" aria-label={`Remove ${o.label}`} onClick={() => void run(() => deleteOption(o.id))}><Icon name="x" /></button>
                    </div>
                    {open && <div className="swatches optpick">
                      {TEAM_COLORS.map(c => <button key={c} className={`swt ${o.color.toLowerCase() === c.toLowerCase() ? 'on' : ''}`} style={{ ['--c' as string]: c }} aria-label={`Colour ${c}`}
                        onClick={() => { setColorFor(null); void run(() => updateOption(o.id, { color: c })); }} />)}
                      <label className="swt custom" title="Any colour" style={{ position: 'relative' }}>+
                        <input type="color" defaultValue={o.color} aria-label="Pick any colour" onChange={e => void run(() => updateOption(o.id, { color: e.target.value }))} /></label>
                    </div>}
                  </div>); })}
                {d.options.length === 0 && <span className="hint">No options yet</span>}
              </div>
              <input className="field-in" placeholder="Add an option and press Enter" aria-label={`Add option to ${d.name}`}
                onKeyDown={e => { const el = e.target as HTMLInputElement; const v = el.value.trim();
                  if (e.key === 'Enter' && v) { el.value = ''; void run(() => addOption(ws.workspace_id, d.id, v, TEAM_COLORS[(d.options.length + 3) % TEAM_COLORS.length], d.options.length)); } }} />
            </div>))}
          {confirmDel && <div className="confirm">Delete “{confirmDel.name}” from every project and task?<span style={{ flex: 1 }} />
            <button className="btn sm" onClick={() => setConfirmDel(null)}>Keep</button>
            <button className="btn sm danger" disabled={busy} onClick={() => void run(async () => { await deleteDim(confirmDel.id); setConfirmDel(null); })}>Delete dimension</button></div>}
          <div className="newfield">
            <input className="field-in" placeholder="New dimension, e.g. Region" aria-label="New dimension name" value={nf.name} onChange={e => { setNf({ ...nf, name: e.target.value }); setErr(null); }} />
            <span className="hint" style={{ alignSelf: 'center' }}>Single choice</span>
            <input className="field-in full" placeholder="Options, separated by commas (e.g. Europe, North Africa, Middle East)" aria-label="Options" value={nf.opts} onChange={e => setNf({ ...nf, opts: e.target.value })} />
            <button className="btn sm full" style={{ justifySelf: 'start' }} disabled={busy} onClick={() => void create()}><Icon name="plus" />Create dimension</button>
          </div>
        </div>
        <div className="mfoot">{err && <span className="err">{err}</span>}<span className="grow" /><span className="hint">Changes save as you go</span>
          <button className="btn primary" onClick={onClose}><Icon name="check" />Done</button></div>
      </div>
    </div>);
}
