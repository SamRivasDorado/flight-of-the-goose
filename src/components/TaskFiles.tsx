import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useWorkspace } from '../auth/session';
import { fileLinks, fileSize, isPicture, LINK_MINUTES, listTaskFiles, noFilesTable, removeTaskFile, uploadTaskFile } from '../lib/files';
import type { Member, Task, TaskFile } from '../lib/types';
import { Icon } from './Logo';

const shortDate = (iso: string) => {
  const d = new Date(iso), now = new Date();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
};
const ext = (name: string) => { const m = /\.([A-Za-z0-9]{1,5})$/.exec(name); return m ? m[1].toUpperCase() : 'FILE'; };
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

/** The little square in front of a file: the picture itself, or the file's extension. */
function Thumb({ name, src }: { name: string; src?: string }) {
  return src ? <img className="tfthumb" src={src} alt="" loading="lazy" /> : <span className="tfext" aria-hidden="true">{ext(name)}</span>;
}

/** Drop zone + "Attach files" button; calls onFiles with what was picked or dropped. */
function useFilePicker(onFiles: (f: File[]) => void) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const zone = {
    onDragOver: (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); },
    onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(false); },
    onDrop: (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); setOver(false); const f = Array.from(e.dataTransfer.files); if (f.length) onFiles(f); },
  };
  const picker = <input ref={input} type="file" multiple hidden aria-hidden="true" tabIndex={-1}
    onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) onFiles(f); }} />;
  return { zone, over, picker, choose: () => input.current?.click() };
}

/**
 * Files attached to a task: open (pictures show a small preview), attach by button or by dropping
 * them here, remove. For a new task the files wait in the draft and are uploaded by Create task.
 */
export function TaskFiles({ task, members, editable, draft, setDraft }: {
  task: Pick<Task, 'id' | 'created_by_member' | 'assignee_member_id'> | null;
  members: Member[]; editable: boolean;
  draft?: File[]; setDraft?: (f: File[]) => void;
}) {
  const ws = useWorkspace();
  const [files, setFiles] = useState<TaskFile[] | null>(task ? null : []);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const busy = useRef(false);
  const taskId = task?.id ?? null;

  async function load() {
    if (!taskId) return;
    try {
      const f = await listTaskFiles(taskId);
      setFiles(f);
      setLinks(f.length ? await fileLinks(f) : {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (noFilesTable(msg)) setMissing(true); else setErr(msg);
    }
  }
  useEffect(() => { void load(); }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps
  // the links to open files run out after a while: ask for fresh ones in good time
  useEffect(() => {
    if (!files?.length) return;
    const t = setInterval(() => { void fileLinks(files).then(setLinks).catch(() => undefined); }, (LINK_MINUTES - 5) * 60e3);
    return () => clearInterval(t);
  }, [files]);

  async function add(picked: File[]) {
    setErr(null);
    if (!taskId) { setDraft?.([...(draft ?? []), ...picked]); return; }
    if (busy.current) return;
    busy.current = true;
    const problems: string[] = [];
    try {
      for (const [i, f] of picked.entries()) {
        setUploading(picked.slice(i).map(x => x.name));
        try { await uploadTaskFile(ws.workspace_id, ws.member_id, taskId, f); }
        catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/one-time database update/.test(msg)) { setMissing(true); break; }
          problems.push(msg);
        }
      }
    } finally { setUploading([]); busy.current = false; }
    if (problems.length) setErr(problems.join(' '));
    await load();
  }

  async function remove(f: TaskFile) {
    setErr(null);
    try { await removeTaskFile(f); setConfirm(null); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }

  const pick = useFilePicker(add);
  if (missing) return <div className="hint">Files need a one-time database update first.</div>;

  const mayRemove = (f: TaskFile) => editable && (f.uploaded_by === ws.member_id || ws.access === 'admin' || ws.access === 'manager'
    || task?.created_by_member === ws.member_id || task?.assignee_member_id === ws.member_id);
  const who = (id: string | null) => members.find(m => m.id === id)?.display_name ?? 'someone who left';
  const list = files ?? [];
  const count = taskId ? list.length : draft?.length ?? 0;

  return (
    <div className={`tfiles ${pick.over ? 'tfdrag' : ''}`} {...(editable ? pick.zone : {})}>
      <div className="tfhead"><div className="h3">Files {count > 0 && <span className="mono">{count}</span>}</div><span className="grow" />
        {editable && <button className="linkbtn" onClick={pick.choose}><Icon name="clip" />Attach files</button>}{pick.picker}</div>
      {taskId && files == null && !err && <div className="hint">Loading files…</div>}
      <div className="tflist">
        {list.map(f => {
          const link = links[f.id];
          return (
            <div key={f.id} className="tfile">
              {link ? <a href={link} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true"><Thumb name={f.name} src={isPicture(f) ? link : undefined} /></a>
                : <Thumb name={f.name} />}
              <div className="tfmain">
                {link ? <a className="tfname" href={link} target="_blank" rel="noopener noreferrer" title={`Open ${f.name}`}>{f.name}</a>
                  : <span className="tfname">{f.name}</span>}
                <span className="muted">{fileSize(f.size)} · {who(f.uploaded_by)} · {shortDate(f.created_at)}</span>
              </div>
              {mayRemove(f) && <button className="iconbtn" aria-label={`Remove ${f.name}`} title="Remove file" onClick={() => setConfirm(f.id)}><Icon name="x" /></button>}
              {confirm === f.id && <div className="confirm tfconfirm">Remove “{f.name}” from this task?<span className="grow" />
                <button className="btn sm" onClick={() => setConfirm(null)}>Keep</button>
                <button className="btn sm danger" onClick={() => void remove(f)}>Remove</button></div>}
            </div>);
        })}
        {!taskId && (draft ?? []).map((f, i) => (
          <div key={`${i}:${f.name}`} className="tfile">
            <Thumb name={f.name} />
            <div className="tfmain"><span className="tfname">{f.name}</span><span className="muted">{fileSize(f.size)} · attached when you create the task</span></div>
            <button className="iconbtn" aria-label={`Remove ${f.name}`} title="Remove file" onClick={() => setDraft?.((draft ?? []).filter((_, j) => j !== i))}><Icon name="x" /></button>
          </div>))}
        {uploading.map(n => (
          <div key={`up:${n}`} className="tfile up"><Thumb name={n} />
            <div className="tfmain"><span className="tfname">{n}</span><span className="muted">Uploading…</span></div></div>))}
      </div>
      {editable && count === 0 && uploading.length === 0 && files != null && (
        <button className="tfzone" onClick={pick.choose}>Drop files here, or click to choose</button>)}
      {!editable && files != null && list.length === 0 && <div className="hint">No files.</div>}
      {err && <div className="err">{err}</div>}
    </div>);
}
