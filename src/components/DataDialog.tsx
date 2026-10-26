import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession, useWorkspace } from '../auth/session';
import { useLens } from '../lib/lens';
import { useLocalPref, useUI } from '../lib/ui';
import {
  downloadBackup, exportCsv, exportXlsx, loadWorkspaceData, readBackup, readImportFiles, restoreBackup, runImport,
  type Backup, type BackupSummary, type ImportResult, type ReadResult, type Tables, type WsData,
} from '../lib/transfer';
import { Icon } from './Logo';

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Data: export to Excel or CSV, import from them, and a full backup that restores as a new workspace. */
export function DataDialog({ onClose }: { onClose: () => void }) {
  const ws = useWorkspace();
  const { session, reloadWorkspaces, switchWorkspace } = useSession();
  const lens = useLens();
  const ui = useUI();
  const [data, setData] = useState<WsData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sep, setSep] = useLocalPref<string>('csvSep', ',');
  const [imp, setImp] = useState<null | { read: ReadResult; preview: ImportResult }>(null);
  const [impDone, setImpDone] = useState<ImportResult | null>(null);
  const [rest, setRest] = useState<null | { backup: Backup; summary: BackupSummary; name: string }>(null);
  const impInput = useRef<HTMLInputElement>(null), bkInput = useRef<HTMLInputElement>(null);

  async function load() { setData(await loadWorkspaceData(ws.workspace_id)); }
  useEffect(() => { load().catch(e => setErr(e instanceof Error ? e.message : String(e))); }, [ws.workspace_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setErr(null); setBusy(label);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }
  const ctx = { ws: ws.workspace_id, me: ws.member_id };

  async function chooseImport(files: File[]) {
    if (!data || !files.length) return;
    setImp(null); setImpDone(null);
    await run('Reading…', async () => {
      const read = await readImportFiles(files, data.dims);
      const { goals, projects, tasks } = read.tables;
      if (!goals.length && !projects.length && !tasks.length)
        throw new Error([...read.warn, 'No goals, projects or tasks were found in the chosen files. Check that the header row is the first filled row.'].join(' '));
      setImp({ read, preview: await runImport(read.tables, data, ctx, false) });
    });
  }
  async function applyImport() {
    if (!imp || !data) return;
    await run('Importing…', async () => {
      const res = await runImport(imp.read.tables, data, ctx, true, (n, total) => setBusy(`Importing… ${n} of ${total}`));
      setImp(null); setImpDone(res);
      await lens.reload(); ui.changed(); await load();
    });
  }
  async function chooseBackup(f: File | undefined) {
    if (!f) return;
    setRest(null);
    await run('Reading…', async () => {
      const { backup, summary } = readBackup(await f.text());
      setRest({ backup, summary, name: `${summary.name} (restored)` });
    });
  }
  async function applyRestore() {
    if (!rest) return;
    const name = rest.name.trim();
    if (!name) { setErr('Give the new workspace a name.'); return; }
    await run('Restoring…', async () => {
      const { wsId, notAdded } = await restoreBackup(rest.backup, name, { uid: session!.user.id, email: session?.user.email ?? '' }, step => setBusy(`Restoring… ${step}`));
      await reloadWorkspaces();
      ui.openTask(null); switchWorkspace(wsId); location.hash = '#/timeline';
      onClose();
      if (notAdded.length) setTimeout(() => alertBox(`Restored as “${name}”. ${plural(notAdded.length, 'person')} from the backup ${notAdded.length === 1 ? 'was' : 'were'} not added: ${notAdded.join(', ')}. Invite them from the Team page if you want them here; their tasks are unassigned for now.`), 300);
    });
  }

  const cnt = (c: { add: number; upd: number; same: number }) => [c.add ? `${c.add} new` : '', c.upd ? `${c.upd} updated` : '', c.same ? `${c.same} unchanged` : ''].filter(Boolean).join(', ') || 'no changes';
  const notes = imp ? [...imp.read.warn, ...imp.preview.W] : [];

  return createPortal(
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal" role="dialog" aria-label="Data" style={{ width: 'min(680px,100%)' }}>
        <h2>Data</h2>
        <div className="mbody">
          <p className="hint" style={{ margin: 0 }}>Everything in {ws.workspace_name} is saved as you work. Use this window to take a copy out, or to bring goals, projects and tasks in from Excel.</p>

          <section className="dsec"><h3>Export goals, projects and tasks</h3>
            <p className="hint">One table each. Edit them in Excel and import them back: every row keeps its ID, so your changes update the right items. Columns marked “calculated” are for reading only.</p>
            <div className="drow">
              <button className="btn primary sm" disabled={!data || !!busy} onClick={() => void run('Saving…', () => exportXlsx(data!, ws.workspace_name))}><Icon name="save" />Excel workbook (.xlsx)</button>
              <span className="muted">Goals, Projects and Tasks sheets, plus a Read me</span></div>
            <div className="drow"><span className="muted">CSV files:</span>
              {(['goals', 'projects', 'tasks'] as (keyof Tables)[]).map(k =>
                <button key={k} className="btn sm" disabled={!data || !!busy} onClick={() => exportCsv(data!, ws.workspace_name, k, sep)}>{k[0].toUpperCase() + k.slice(1)}.csv</button>)}
              <span className="seg" role="group" aria-label="CSV separator">
                <button className={sep === ',' ? 'on' : ''} aria-pressed={sep === ','} onClick={() => setSep(',')}>Comma</button>
                <button className={sep === ';' ? 'on' : ''} aria-pressed={sep === ';'} onClick={() => setSep(';')}>Semicolon</button></span></div>
            <p className="hint" style={{ fontSize: 12 }}>Use Semicolon if Excel opens the CSV with everything in one column (common when Excel is set to Spanish or another European format).</p>
          </section>

          <section className="dsec"><h3>Import from Excel or CSV</h3>
            <p className="hint">Choose an exported workbook, or one to three CSV files. You see what will change first; nothing is saved until you press Import. Importing adds and updates; it never deletes.</p>
            <div className="drow">
              <button className="btn sm" disabled={!data || !!busy} onClick={() => impInput.current?.click()}><Icon name="plus" />Choose files</button>
              <input ref={impInput} type="file" multiple hidden accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; void chooseImport(f); }} />
              {imp && <span className="muted">{imp.read.files.join(', ')}</span>}</div>
            {imp && <div className="impbox">
              <table className="imptab"><tbody>
                <tr><td>Goals</td><td>{imp.read.tables.goals.length ? cnt(imp.preview.C.goals) : <span className="muted">not in the file</span>}</td></tr>
                <tr><td>Projects</td><td>{imp.read.tables.projects.length || imp.preview.C.projects.add ? cnt(imp.preview.C.projects) : <span className="muted">not in the file</span>}</td></tr>
                <tr><td>Tasks</td><td>{imp.read.tables.tasks.length ? cnt(imp.preview.C.tasks) : <span className="muted">not in the file</span>}</td></tr></tbody></table>
              {notes.length > 0 && <details open={notes.length <= 4}><summary>{plural(notes.length, 'note')} about this file</summary>
                <ul className="implist">{notes.slice(0, 40).map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
              <div className="drow"><button className="btn primary sm" disabled={!!busy} onClick={() => void applyImport()}><Icon name="check" />Import</button>
                <button className="btn sm ghost" disabled={!!busy} onClick={() => setImp(null)}>Cancel</button></div></div>}
            {impDone && <div className="impbox" role="status">
              <b>Imported.</b>
              <span className="hint">Goals: {cnt(impDone.C.goals)} · Projects: {cnt(impDone.C.projects)} · Tasks: {cnt(impDone.C.tasks)}</span>
              {impDone.failed > 0 && <span className="err">{plural(impDone.failed, 'row')} could not be saved; see the notes below.</span>}
              {impDone.W.length > 0 && <details open={impDone.failed > 0}><summary>{plural(impDone.W.length, 'note')}</summary>
                <ul className="implist">{impDone.W.slice(0, 60).map((w, i) => <li key={i}>{w}</li>)}</ul></details>}</div>}
          </section>

          <section className="dsec"><h3>Full backup</h3>
            <p className="hint">Everything in {ws.workspace_name} as one file: goals, projects, tasks, subtasks, notebooks, dimensions, teams and who is in them. Keep it somewhere safe. A backup is restored as a new workspace, so it never overwrites anything.</p>
            <div className="drow">
              <button className="btn sm" disabled={!!busy} onClick={() => void run('Saving…', () => downloadBackup(ws.workspace_id, ws.workspace_name))}><Icon name="save" />Download backup (.json)</button>
              <button className="btn sm" disabled={!!busy} onClick={() => bkInput.current?.click()}>Restore a backup…</button>
              <input ref={bkInput} type="file" hidden accept=".json,application/json" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void chooseBackup(f); }} /></div>
            {rest && <div className="impbox">
              <span>Backup of <b>{rest.summary.name}</b>, saved {new Date(rest.summary.exported).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}:
                {' '}{rest.summary.counts.filter(([, n]) => n).map(([w, n]) => `${n} ${w}`).join(', ') || 'empty'}.</span>
              <div><label className="lbl" htmlFor="rs-name">Name of the new workspace</label>
                <input id="rs-name" className="field-in" style={{ width: '100%' }} value={rest.name} maxLength={80} onChange={e => setRest({ ...rest, name: e.target.value })} /></div>
              <span className="hint">You will be its admin. {rest.summary.people.length > 1 ? 'Other people in the backup are not added, because adding them would invite them; their projects and goals become yours and their tasks are left unassigned.' : ''}</span>
              <div className="drow"><button className="btn primary sm" disabled={!!busy} onClick={() => void applyRestore()}><Icon name="check" />Restore as a new workspace</button>
                <button className="btn sm ghost" disabled={!!busy} onClick={() => setRest(null)}>Cancel</button></div></div>}
          </section>
        </div>
        <div className="mfoot">{err ? <span className="err">{err}</span> : busy ? <span className="hint" role="status">{busy}</span> : !data ? <span className="hint">Loading…</span> : null}
          <span className="grow" /><button className="btn" disabled={!!busy && /^(Restoring|Importing)/.test(busy)} onClick={onClose}>Done</button></div>
      </div>
    </div>, document.body);
}

/** A small message box after a restore (the Data window has closed by then). */
function alertBox(msg: string) {
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.style.maxWidth = 'min(560px, calc(100vw - 32px))';
  t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 9000);
}
