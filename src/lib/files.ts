import { db, isDemo } from './supabase';
import type { TaskFile } from './types';

/** Files attached to tasks live in the private "task-files" bucket: no public links, only short-lived signed ones. */
const BUCKET = 'task-files';
/** The live limit per file (set on the bucket too). The prototype keeps files in the browser, so it takes less. */
export const MAX_FILE_MB = isDemo ? 2 : 25;

/** The files table or bucket is not there yet (the one-time database update has not been run). */
export const noFilesTable = (msg: string) =>
  (/task_files/.test(msg) && /(does not exist|schema cache|not find)/i.test(msg)) || /bucket not found/i.test(msg);

export const fileSize = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;

/** Kinds the browser can show by itself; other files are downloaded with their own name. */
export const viewable = (f: Pick<TaskFile, 'mime'>) => /^(image\/|application\/pdf$|text\/plain$|video\/|audio\/)/.test(f.mime);
export const isPicture = (f: Pick<TaskFile, 'mime'>) => /^image\/(png|jpe?g|gif|webp|svg\+xml|bmp|avif)$/.test(f.mime);

/** A storage-safe version of a file name (storage keys refuse accents and some symbols); the real name stays in the row. */
function safeName(name: string) {
  const s = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-100);
  return s || 'file';
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function listTaskFiles(taskId: string): Promise<TaskFile[]> {
  return check(await db().from('task_files').select('*').eq('task_id', taskId).order('created_at'));
}

/** Stores one file and records it on the task. */
export async function uploadTaskFile(ws: string, me: string, taskId: string, file: File): Promise<TaskFile> {
  if (file.size > MAX_FILE_MB * 1024 * 1024)
    throw new Error(`“${file.name}” is ${fileSize(file.size)}; files can be up to ${MAX_FILE_MB} MB${isDemo ? ' in the prototype (25 MB in the real Goose)' : ''}.`);
  const id = crypto.randomUUID();
  const path = `${ws}/${taskId}/${id}/${safeName(file.name)}`;
  const mime = file.type || 'application/octet-stream';
  const up = await db().storage.from(BUCKET).upload(path, file, { contentType: mime, upsert: false });
  if (up.error) {
    if (noFilesTable(up.error.message)) throw new Error('Files need a one-time database update first.');
    throw new Error(`“${file.name}” could not be uploaded: ${up.error.message}`);
  }
  const r = await db().from('task_files')
    .insert({ id, workspace_id: ws, task_id: taskId, name: file.name.slice(0, 255) || 'file', size: file.size, mime, path, uploaded_by: me }).select().single();
  if (r.error) { await db().storage.from(BUCKET).remove([path]).catch(() => undefined); throw new Error(r.error.message); }
  return r.data as TaskFile;
}

/** Removes the record first (that is where the rules are checked), then the stored file. */
export async function removeTaskFile(f: TaskFile) {
  const r = await db().from('task_files').delete().eq('id', f.id).select('id');
  if (r.error) throw new Error(r.error.message);
  if (!r.data?.length) throw new Error('Only the person who attached a file, the task’s owner, managers and admins can remove it.');
  await db().storage.from(BUCKET).remove([f.path]).catch(() => undefined);
}

/** How long the links to open files last; the Files section asks for fresh ones before they run out. */
export const LINK_MINUTES = 60;

/**
 * Links for opening each file (valid for LINK_MINUTES): files the browser can show open in a new tab;
 * other files download under their own name.
 */
export async function fileLinks(files: TaskFile[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const show = files.filter(viewable), get = files.filter(f => !viewable(f));
  const store = db().storage.from(BUCKET);
  await Promise.all([
    show.length ? store.createSignedUrls(show.map(f => f.path), LINK_MINUTES * 60).then(r => (r.data ?? []).forEach((x, i) => { if (x.signedUrl) out[show[i].id] = x.signedUrl; })) : null,
    ...get.map(f => store.createSignedUrl(f.path, LINK_MINUTES * 60, { download: f.name }).then(r => { if (r.data?.signedUrl) out[f.id] = r.data.signedUrl; })),
  ]);
  return out;
}
