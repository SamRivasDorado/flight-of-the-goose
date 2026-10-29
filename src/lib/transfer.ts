/**
 * Data window: export to Excel/CSV, import from Excel/CSV (merge), and a full backup
 * of a workspace that can be restored as a NEW workspace (never over an existing one).
 *
 * Import and restore write straight to the database (not through updateTask and friends),
 * so a bulk change does not send geese across the screen.
 */
import { db } from './supabase';
import { listDims, listDimValues, listGoals, listMembers, listProjectsFull, listTasksFull, listTeams, todayISO } from './data';
import { goalProgress } from './goals';
import { cleanTag } from './goaltag';
import { GOAL_STATUSES, STATUSES, type Dim, type Goal, type Member, type ProjectFull, type TaskFull, type Team } from './types';
import { PROJECT_COLORS } from '../config';
import { PROJECT_ICONS } from '../components/Logo';

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ---------------------------------------------------------------- reading the workspace

export interface WsData {
  goals: Goal[]; projects: ProjectFull[]; tasks: TaskFull[]; members: Member[]; teams: Team[]; dims: Dim[];
  /** dimension values: task id → field id → option id, and project defaults the same way */
  taskVals: Map<string, Map<string, string>>; projVals: Map<string, Map<string, string>>;
}

export async function loadWorkspaceData(ws: string): Promise<WsData> {
  const [goals, projects, tasks, members, teams, dims, vals] = await Promise.all([
    listGoals(ws), listProjectsFull(ws), listTasksFull(ws), listMembers(ws), listTeams(ws), listDims(ws), listDimValues()]);
  const taskVals = new Map<string, Map<string, string>>(), projVals = new Map<string, Map<string, string>>();
  const tids = new Set(tasks.map(t => t.id)), pids = new Set(projects.map(p => p.id));
  for (const v of vals.task) if (v.option_id && tids.has(v.task_id)) { if (!taskVals.has(v.task_id)) taskVals.set(v.task_id, new Map()); taskVals.get(v.task_id)!.set(v.field_id, v.option_id); }
  for (const v of vals.project) if (pids.has(v.project_id)) { if (!projVals.has(v.project_id)) projVals.set(v.project_id, new Map()); projVals.get(v.project_id)!.set(v.field_id, v.option_id); }
  return { goals, projects, tasks, members, teams, dims, taskVals, projVals };
}

// ---------------------------------------------------------------- export

export const CALC = ' (calculated)';
export type Cell = string | number;
export interface Tables { goals: Cell[][]; projects: Cell[][]; tasks: Cell[][] }

const TASK_STATUS_LABEL = (s: string) => (STATUSES.find(x => x.id === s) ?? STATUSES[0]).label;
const GOAL_STATUS_LABEL = (s: string) => (GOAL_STATUSES.find(x => x.id === s) ?? GOAL_STATUSES[0]).label;
const PROJECT_STATUS: Record<string, string> = { active: 'Active', paused: 'Paused', closed: 'Done' };

/** Top-level goals, each followed by its sub-goals. */
const ordered = (goals: Goal[]) => goals.filter(g => !g.parent_id).flatMap(g => [g, ...goals.filter(k => k.parent_id === g.id)]);

export function exportTables(d: WsData): Tables {
  const name = (id: string | null) => d.members.find(m => m.id === id)?.display_name ?? '';
  const names = (ids: string[]) => ids.map(name).filter(Boolean).join('; ');
  const gTitle = (id: string | null) => d.goals.find(g => g.id === id)?.title ?? '';
  const pName = (id: string | null) => d.projects.find(p => p.id === id)?.name ?? '';
  const opt = (dim: Dim, id: string | undefined) => dim.options.find(o => o.id === id)?.label ?? '';
  const goals: Cell[][] = [['Goal ID', 'Level', 'Goal', 'Short name', 'Parent goal', 'Owner', 'Start', 'End', 'Status', 'Linked projects', 'Manual progress %', 'Notes', 'Progress %' + CALC],
    ...ordered(d.goals).map(g => [g.id, g.parent_id ? 'Sub-goal' : 'Goal', g.title, g.short_name || '', gTitle(g.parent_id), name(g.owner_member_id), g.start_date, g.end_date ?? '',
      GOAL_STATUS_LABEL(g.status), g.project_ids.map(pName).filter(Boolean).join('; '), g.manual_progress || 0, g.notes || '', goalProgress(g, d.goals, d.tasks)])];
  const projects: Cell[][] = [['Project ID', 'Project', 'Owner', 'Members', 'Shared with teams', 'Kind', 'Status', 'Start', 'End', 'Colour', 'Symbol', ...d.dims.map(x => x.name), 'Open tasks' + CALC, 'Hours logged' + CALC],
    ...d.projects.map(p => { const ts = d.tasks.filter(t => t.project_id === p.id); return [p.id, p.name, name(p.owner_member_id), names(p.member_ids),
      p.team_ids.map(id => d.teams.find(t => t.id === id)?.name).filter(Boolean).join('; '), p.kind === 'fixed' ? 'Fixed term' : 'Ongoing', PROJECT_STATUS[p.status] ?? 'Active',
      p.start_date ?? '', p.kind === 'fixed' ? p.end_date ?? '' : '', p.color, p.image_path ? '(own image)' : p.icon, ...d.dims.map(x => opt(x, d.projVals.get(p.id)?.get(x.id))),
      ts.filter(t => t.status !== 'done').length, +ts.reduce((s, t) => s + (Number(t.hours) || 0), 0).toFixed(2)]; })];
  const tasks: Cell[][] = [['Task ID', 'Task', 'Project', 'Goal', 'Assignee', 'Collaborators', 'Due date', 'Status', 'Completed on', 'Hours', 'Created' + CALC, ...d.dims.map(x => x.name), 'Subtasks', 'Description', ...d.dims.map(x => `${x.name} incl. project default${CALC}`)],
    ...d.tasks.map(t => [t.id, t.title, pName(t.project_id), gTitle(t.goal_id), name(t.assignee_member_id), names(t.collaborator_ids), t.due_date ?? '', TASK_STATUS_LABEL(t.status),
      t.completed_at ?? '', t.hours ?? '', t.created_at.slice(0, 10), ...d.dims.map(x => opt(x, d.taskVals.get(t.id)?.get(x.id))),
      t.subtasks.map(s => `[${s.done ? 'x' : ' '}] ${s.title}`).join('\n'), t.description || '',
      ...d.dims.map(x => opt(x, d.taskVals.get(t.id)?.get(x.id) ?? (t.project_id ? d.projVals.get(t.project_id)?.get(x.id) : undefined)))])];
  return { goals, projects, tasks };
}

const README: string[] = [
  'How to use this workbook',
  '',
  'Each sheet holds one kind of item: Goals, Projects and Tasks. Keep the header row as it is.',
  'ID columns link a row back to the item in Goose. Leave them as they are to update items; leave them empty on new rows to add items.',
  'Columns whose header ends in “(calculated)” are for reading only. They are ignored when you import.',
  'Dates are written as YYYY-MM-DD. On import, day/month/year dates such as 23/10/2026 and real Excel dates also work.',
  'Project, Goal and Parent goal are matched by name. A project name Goose does not know yet is created on import.',
  'Dimension columns (Priority, Region, …) use the option labels. A label Goose does not know yet is added as a new option.',
  'Subtasks: one per line inside the cell, written as “[x] done subtask” or “[ ] open subtask”. Linked projects: names separated by semicolons.',
  'People (Owner, Assignee, Members, Collaborators) are matched by their name as shown on the Team page, or by email. Several are separated by semicolons.',
  'An empty End on a goal means open-ended. Status values: To do, In progress, Done for tasks; Active, Paused, Done for projects; On track, At risk, Off track, Done for goals (Achieved is also understood).',
  'Importing adds and updates items; it never deletes anything.',
];

/** Saves a file through the browser's normal download. */
export function download(filename: string, data: Blob | string, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'goose';

export async function exportXlsx(d: WsData, wsName: string) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const T = exportTables(d);
  const head = (rows: Cell[][]) => rows.map((r, i) => i === 0 ? r.map(v => ({ value: String(v), fontWeight: 'bold' as const })) : r.map(v => v === '' ? null : v));
  const widths = (rows: Cell[][]) => rows[0].map((h, i) => ({ width: Math.min(60, Math.max(10, String(h).length + 2, ...rows.slice(1, 200).map(r => String(r[i] ?? '').split('\n')[0].length + 2))) }));
  const sheet = (name: string, rows: Cell[][]) => ({ sheet: name, data: head(rows), columns: widths(rows), stickyRowsCount: 1 });
  const blob = await writeXlsxFile([sheet('Goals', T.goals), sheet('Projects', T.projects), sheet('Tasks', T.tasks),
    { sheet: 'Read me', data: README.map((l, i) => [i === 0 ? { value: l, fontWeight: 'bold' as const } : l]), columns: [{ width: 120 }] }]).toBlob();
  download(`${slug(wsName)}-${todayISO()}.xlsx`, blob);
}

export function toCSV(rows: Cell[][], sep: string) {
  const cell = (v: Cell) => { const s = v == null ? '' : String(v); return (s.includes(sep) || /["\r\n]/.test(s) || s !== s.trim()) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + rows.map(r => r.map(cell).join(sep)).join('\r\n') + '\r\n';
}
export function exportCsv(d: WsData, wsName: string, k: keyof Tables, sep: string) {
  download(`${slug(wsName)}-${k}-${todayISO()}.csv`, toCSV(exportTables(d)[k], sep), 'text/csv;charset=utf-8');
}

// ---------------------------------------------------------------- reading files

export type Obj = Record<string, unknown>;
export interface ImportTables { goals: Obj[]; projects: Obj[]; tasks: Obj[] }
export interface ReadResult { tables: ImportTables; warn: string[]; files: string[] }

function parseCSV(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  let sep: string;
  const m = text.match(/^sep=(.)\r?\n/i);
  if (m) { sep = m[1]; text = text.slice(m[0].length); }
  else { const first = text.split(/\r?\n/, 1)[0], n = (c: string) => first.split(c).length - 1; sep = n('\t') > n(',') && n('\t') > n(';') ? '\t' : n(';') > n(',') ? ';' : ','; }
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function decodeText(buf: ArrayBuffer) { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); } }
function rowsToObjects(rows: unknown[][]) {
  const filled = (r: unknown[]) => (r || []).filter(v => String(v ?? '').trim() !== '').length;
  const h = rows.findIndex(r => filled(r) >= 2);
  if (h < 0) return { headers: [] as string[], objs: [] as Obj[] };
  const headers = rows[h].map(v => String(v ?? '').trim());
  const objs = rows.slice(h + 1).filter(r => filled(r)).map(r => { const o: Obj = {}; headers.forEach((k, i) => { if (k) o[k] = r[i] ?? ''; }); return o; });
  return { headers, objs };
}
function detectType(name: string, headers: string[]): keyof ImportTables | 'skip' | null {
  const n = (name || '').toLowerCase(), hs = headers.map(h => h.toLowerCase());
  if (/read ?me/.test(n)) return 'skip';
  if (/task/.test(n) || hs.includes('task id') || hs.includes('task')) return 'tasks';
  if (/goal|strateg/.test(n) || hs.includes('goal id') || hs.includes('parent goal')) return 'goals';
  if (/project/.test(n) || hs.includes('project id') || hs.includes('kind')) return 'projects';
  return null;
}
const KNOWN: Record<keyof ImportTables, string[]> = {
  goals: ['Goal ID', 'Level', 'Goal', 'Short name', 'Parent goal', 'Owner', 'Start', 'End', 'Status', 'Linked projects', 'Manual progress %', 'Notes'],
  projects: ['Project ID', 'Project', 'Owner', 'Members', 'Shared with teams', 'Kind', 'Status', 'Start', 'End', 'Colour', 'Symbol'],
  tasks: ['Task ID', 'Task', 'Project', 'Goal', 'Assignee', 'Collaborators', 'Due date', 'Status', 'Completed on', 'Hours', 'Subtasks', 'Description'],
};

/** Reads an exported workbook or one to three CSV files into rows of goals, projects and tasks. */
export async function readImportFiles(files: File[], dims: Dim[]): Promise<ReadResult> {
  const tables: ImportTables = { goals: [], projects: [], tasks: [] }, warn: string[] = [], names: string[] = [];
  for (const f of files) {
    names.push(f.name);
    try {
      const isX = /\.xlsx$/i.test(f.name);
      if (/\.xls$/i.test(f.name)) { warn.push(`“${f.name}” is an old Excel file (.xls). Save it as .xlsx or CSV in Excel, then choose it again.`); continue; }
      let sheets: { name: string; rows: unknown[][] }[];
      if (isX) {
        const { default: readXlsxFile } = await import('read-excel-file/browser');
        sheets = (await readXlsxFile(f)).map(s => ({ name: s.sheet, rows: s.data as unknown[][] }));
      } else sheets = [{ name: f.name.replace(/\.[^.]+$/, ''), rows: parseCSV(decodeText(await f.arrayBuffer())) }];
      for (const sh of sheets) {
        const { headers, objs } = rowsToObjects(sh.rows), type = detectType(sh.name, headers);
        if (type === 'skip') continue;
        if (!type) { if (objs.length) warn.push(`${isX ? `Sheet “${sh.name}”` : `File “${f.name}”`} was skipped: it does not look like goals, projects or tasks.`); continue; }
        const known = [...KNOWN[type], ...dims.map(x => x.name)].map(h => h.toLowerCase());
        const unknown = headers.filter(h => h && !h.toLowerCase().endsWith(CALC.trim().toLowerCase()) && !known.includes(h.toLowerCase()) && h.toLowerCase() !== 'created');
        if (unknown.length) warn.push(`${type[0].toUpperCase() + type.slice(1)}: ignored column${unknown.length > 1 ? 's' : ''} ${unknown.map(u => `“${u}”`).join(', ')}. Add a dimension with that name first if you want to import it.`);
        tables[type].push(...objs);
      }
    } catch { warn.push(`“${f.name}” could not be read.`); }
  }
  return { tables, warn, files: names };
}

const pad = (n: number) => String(n).padStart(2, '0');
/** A date cell as YYYY-MM-DD; '' when empty; null when it is not a date. */
export function normDate(v: unknown): string | null {
  if (v == null || v === '') return '';
  const fromUTC = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (v instanceof Date) return isNaN(+v) ? null : fromUTC(new Date(v.getTime() + 12 * 3600e3));
  if (typeof v === 'number') return v > 0 && v < 200000 ? fromUTC(new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5)) : null;
  const s = String(v).trim(); if (!s) return '';
  let m: RegExpMatchArray | null, y: number, mo: number, d: number;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
  else return null;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? fromUTC(t) : null;
}

// ---------------------------------------------------------------- import (merge)

export interface Counts { add: number; upd: number; same: number }
export interface ImportResult { C: { goals: Counts; projects: Counts; tasks: Counts }; W: string[]; failed: number }

/**
 * Merges the rows into the workspace. With apply = false nothing is written: it works out
 * what would happen (counts and notes) for the preview. Rows keep their ID, so edited rows
 * update the right item; rows without an ID are added. Nothing is ever deleted.
 */
export async function runImport(tables: ImportTables, d: WsData, ctx: { ws: string; me: string }, apply: boolean,
  progress?: (done: number, total: number) => void): Promise<ImportResult> {
  const W: string[] = [], C = { goals: { add: 0, upd: 0, same: 0 }, projects: { add: 0, upd: 0, same: 0 }, tasks: { add: 0, upd: 0, same: 0 } };
  const sorted = (a: string[]) => [...a].sort().join(',');
  const num = (v: unknown) => v == null || v === '' ? null : Number(v);
  let failed = 0, done = 0, fake = 0;
  const total = tables.projects.length + tables.goals.length + tables.tasks.length;
  const tick = () => { done++; progress?.(done, total); };
  const newId = () => apply ? crypto.randomUUID() : `new-${++fake}`;
  const lc = (x: unknown) => String(x ?? '').trim().toLowerCase();
  const val = (r: Obj, name: string) => { const want = name.toLowerCase(); for (const k in r) if (k.trim().toLowerCase() === want) return r[k]; return undefined; };
  const has = (r: Obj, name: string) => val(r, name) !== undefined;
  const str = (v: unknown) => v == null ? '' : v instanceof Date ? (normDate(v) || '') : String(v).trim();
  const date = (r: Obj, name: string, who: string) => {
    const v = val(r, name); if (v === undefined) return undefined;
    const x = normDate(v); if (x === null) { W.push(`${who}: “${str(v)}” in ${name} is not a date, so it was left empty.`); return ''; }
    return x;
  };
  const fail = (what: string, e: unknown) => { failed++; W.push(`${what} could not be saved: ${e instanceof Error ? e.message : String(e)}`); };

  // working copies, so later rows see the projects and goals that earlier rows created
  const P = d.projects.map(p => ({ ...p, member_ids: [...p.member_ids], team_ids: [...p.team_ids] }));
  const G = d.goals.map(g => ({ ...g, project_ids: [...g.project_ids] }));
  const T = new Map(d.tasks.map(t => [t.id, t]));
  const dims = d.dims.map(x => ({ ...x, options: [...x.options] }));
  const projByName = (n: string) => P.find(p => lc(p.name) === lc(n));
  const goalByTitle = (t: string) => G.find(g => lc(g.title) === lc(t));
  const person = (n: string, who: string) => {
    if (!n) return null;
    const x = d.members.find(m => lc(m.display_name) === lc(n) || lc(m.email) === lc(n));
    if (!x) W.push(`${who}: nobody called “${n}” in this workspace, so it was left empty.`);
    return x?.id ?? null;
  };
  const people = (v: unknown, who: string) => str(v).split(';').map(x => x.trim()).filter(Boolean).map(n => person(n, who)).filter((x): x is string => !!x);
  const optFor = async (dim: Dim, label: string) => {
    label = str(label); if (!label) return null;
    let o = dim.options.find(x => lc(x.label) === lc(label));
    if (!o) {
      const color = PROJECT_COLORS[(dim.options.length * 5 + 1) % PROJECT_COLORS.length];
      const id = newId();
      if (apply) check(await db().from('field_options').insert({ id, field_id: dim.id, workspace_id: ctx.ws, label, color, position: dim.options.length }));
      o = { id, field_id: dim.id, label, color, position: dim.options.length }; dim.options.push(o);
      W.push(`Added “${label}” as a new ${dim.name} option.`);
    }
    return o.id;
  };
  async function syncLinks(table: string, key: string, id: string, col: string, before: string[], after: string[]) {
    const add = after.filter(x => !before.includes(x)), drop = before.filter(x => !after.includes(x));
    if (add.length) check(await db().from(table).insert(add.map(v => ({ [key]: id, [col]: v }))));
    if (drop.length) check(await db().from(table).delete().eq(key, id).in(col, drop));
  }
  async function newProject(name: string, id?: string) {
    const p: ProjectFull = { id: id || newId(), workspace_id: ctx.ws, name, color: PROJECT_COLORS[P.length % PROJECT_COLORS.length], icon: 'folder', image_path: null, image_fit: 'fit',
      created_at: new Date().toISOString(), kind: 'ongoing', status: 'active', start_date: todayISO(), end_date: null, owner_member_id: ctx.me, member_ids: [], team_ids: [], goal_ids: [] };
    if (apply) check(await db().from('projects').insert({ id: p.id, workspace_id: ctx.ws, name, color: p.color, icon: p.icon, kind: p.kind, status: p.status, start_date: p.start_date, owner_member_id: p.owner_member_id }));
    P.push(p); C.projects.add++;
    return p;
  }
  const known = (id: string, list: { id: string }[]) => !!id && list.some(x => x.id === id);

  // ---- projects
  for (const r of tables.projects) {
    const name = str(val(r, 'Project')); if (!name) { tick(); continue; }
    const id = str(val(r, 'Project ID'));
    try {
      let p = (known(id, P) ? P.find(x => x.id === id) : undefined) ?? projByName(name);
      const before = p ? { member_ids: [...p.member_ids], team_ids: [...p.team_ids] } : { member_ids: [] as string[], team_ids: [] as string[] };
      const isNew = !p;
      if (!p) p = await newProject(name);
      const psig = (x: ProjectFull) => JSON.stringify([x.name, x.kind, x.status, x.start_date, x.end_date, x.color, x.icon, x.image_path, x.owner_member_id, sorted(x.member_ids), sorted(x.team_ids)]);
      const was = psig(p);
      p.name = name;
      const kind = lc(val(r, 'Kind')); if (kind) p.kind = /fix/.test(kind) ? 'fixed' : 'ongoing';
      const st = lc(val(r, 'Status')); if (st) p.status = /paus/.test(st) ? 'paused' : /clos|done|complet/.test(st) ? 'closed' : 'active';
      const sd = date(r, 'Start', name); if (sd !== undefined) p.start_date = sd || null;
      const ed = date(r, 'End', name); if (ed !== undefined) p.end_date = ed || null;
      if (p.kind !== 'fixed') p.end_date = null; else if (!p.end_date) W.push(`Project “${name}” is fixed term but has no end date.`);
      const col = str(val(r, 'Colour')); if (/^#[0-9a-f]{6}$/i.test(col)) p.color = col;
      const sym = str(val(r, 'Symbol')); if ((PROJECT_ICONS as string[]).includes(sym)) { p.icon = sym; p.image_path = null; }
      if (has(r, 'Owner')) { const o = person(str(val(r, 'Owner')), `Project “${name}”`); if (o) p.owner_member_id = o; }
      if (has(r, 'Members')) p.member_ids = people(val(r, 'Members'), `Project “${name}”`).filter(x => x !== p!.owner_member_id);
      if (has(r, 'Shared with teams')) p.team_ids = str(val(r, 'Shared with teams')).split(';').map(x => x.trim()).filter(Boolean)
        .map(n => { const t = d.teams.find(q => lc(q.name) === lc(n)); if (!t) W.push(`Project “${name}”: no team called “${n}”.`); return t?.id; }).filter((x): x is string => !!x);
      const defaults: [string, string | null][] = [];
      for (const dim of dims) if (has(r, dim.name)) defaults.push([dim.id, await optFor(dim, str(val(r, dim.name)))]);
      const changedDefaults = defaults.filter(([fid, oid]) => (d.projVals.get(p!.id)?.get(fid) ?? null) !== oid);
      const changed = isNew || psig(p) !== was || changedDefaults.length > 0;
      if (!isNew) { if (changed) C.projects.upd++; else C.projects.same++; }
      if (apply && changed) {
        check(await db().from('projects').update({ name: p.name, kind: p.kind, status: p.status, start_date: p.start_date, end_date: p.end_date, color: p.color, icon: p.icon,
          image_path: p.image_path, owner_member_id: p.owner_member_id }).eq('id', p.id).select('id').single());
        await syncLinks('project_members', 'project_id', p.id, 'member_id', before.member_ids, p.member_ids);
        await syncLinks('project_teams', 'project_id', p.id, 'team_id', before.team_ids, p.team_ids);
        for (const [fid, oid] of changedDefaults) {
          if (oid) check(await db().from('project_defaults').upsert({ project_id: p.id, field_id: fid, option_id: oid }));
          else check(await db().from('project_defaults').delete().eq('project_id', p.id).eq('field_id', fid));
        }
      }
    } catch (e) { fail(`Project “${name}”`, e); }
    tick();
  }

  // ---- goals (parents are linked in a second pass, once every goal exists)
  const parents: [Goal, string][] = [];
  const unchangedGoals = new Set<string>();
  for (const r of tables.goals) {
    const title = str(val(r, 'Goal')); if (!title) { tick(); continue; }
    const id = str(val(r, 'Goal ID'));
    try {
      let g = known(id, G) ? G.find(x => x.id === id) : goalByTitle(title);
      const before = g ? [...g.project_ids] : [];
      const isNew = !g;
      const gsig = (x: Goal) => JSON.stringify([x.title, x.short_name, x.start_date, x.end_date, x.status, x.manual_progress, x.notes, x.owner_member_id, sorted(x.project_ids)]);
      const was = g ? gsig(g) : '';
      if (!g) {
        g = { id: newId(), workspace_id: ctx.ws, parent_id: null, title, start_date: todayISO(), end_date: null, status: 'on_track', manual_progress: 0, notes: '',
          owner_member_id: ctx.me, created_at: new Date().toISOString(), project_ids: [], short_name: '', color: null };
        G.push(g); C.goals.add++;
      }
      g.title = title;
      const sd = date(r, 'Start', title); if (sd) g.start_date = sd;
      const ed = date(r, 'End', title); if (ed !== undefined) g.end_date = ed || null;
      if (g.end_date && g.end_date < g.start_date) { W.push(`Goal “${title}” ends before it starts, so its end date was cleared.`); g.end_date = null; }
      const st = lc(val(r, 'Status'));
      if (st) { const m = GOAL_STATUSES.find(x => lc(x.label) === st || x.id === st); if (m) g.status = m.id; else if (st === 'achieved') g.status = 'achieved'; else W.push(`Goal “${title}”: unknown status “${st}”.`); }
      if (has(r, 'Linked projects')) g.project_ids = str(val(r, 'Linked projects')).split(';').map(x => x.trim()).filter(Boolean)
        .map(n => { const p = projByName(n); if (!p) W.push(`Goal “${title}”: no project called “${n}”.`); return p?.id; }).filter((x): x is string => !!x);
      if (has(r, 'Manual progress %')) { const v = parseFloat(str(val(r, 'Manual progress %')).replace(',', '.')); if (isFinite(v)) g.manual_progress = Math.round(Math.max(0, Math.min(100, v))); }
      if (has(r, 'Notes')) g.notes = str(val(r, 'Notes'));
      if (has(r, 'Short name')) { const raw = str(val(r, 'Short name')), tg = cleanTag(raw); if (raw.trim() && tg !== raw.trim().toUpperCase()) W.push(`Goal “${title}”: short name shortened to “${tg}” (up to 8 characters).`); g.short_name = tg; }
      if (has(r, 'Owner')) { const o = person(str(val(r, 'Owner')), `Goal “${title}”`); if (o) g.owner_member_id = o; }
      if (has(r, 'Parent goal')) parents.push([g, str(val(r, 'Parent goal'))]);
      const changed = isNew || gsig(g) !== was;
      if (!isNew) { if (changed) C.goals.upd++; else { C.goals.same++; unchangedGoals.add(g.id); } }
      if (apply && changed) {
        const row = { title: g.title, short_name: g.short_name ?? '', start_date: g.start_date, end_date: g.end_date, status: g.status, manual_progress: g.manual_progress, notes: g.notes, owner_member_id: g.owner_member_id };
        if (isNew) check(await db().from('goals').insert({ id: g.id, workspace_id: ctx.ws, ...row }));
        else check(await db().from('goals').update(row).eq('id', g.id).select('id').single());
        await syncLinks('goal_projects', 'goal_id', g.id, 'project_id', before, g.project_ids);
      }
    } catch (e) { fail(`Goal “${title}”`, e); }
    tick();
  }
  for (const [g, pt] of parents) {
    let want: string | null = g.parent_id;
    if (!pt) want = null;
    else {
      const par = G.find(x => x.id === pt) ?? goalByTitle(pt);
      if (!par || par.id === g.id) { W.push(`Goal “${g.title}”: no parent goal called “${pt}”, so it stays top-level.`); want = null; }
      else if (par.parent_id) { W.push(`Goal “${g.title}”: “${pt}” is itself a sub-goal; sub-goals can only sit under a top-level goal.`); continue; }
      else if (G.some(k => k.parent_id === g.id)) { W.push(`Goal “${g.title}” has sub-goals of its own, so it cannot become a sub-goal.`); continue; }
      else want = par.id;
    }
    if (want === g.parent_id) continue;
    g.parent_id = want;
    if (unchangedGoals.delete(g.id)) { C.goals.same--; C.goals.upd++; }
    if (apply) try { check(await db().from('goals').update({ parent_id: want }).eq('id', g.id).select('id').single()); } catch (e) { fail(`Goal “${g.title}”`, e); }
  }

  // ---- tasks
  for (const r of tables.tasks) {
    const title = str(val(r, 'Task')); if (!title) { tick(); continue; }
    const id = str(val(r, 'Task ID'));
    try {
      const old = id ? T.get(id) : undefined;
      const t = { project_id: old?.project_id ?? null, goal_id: old?.goal_id ?? null, title, description: old?.description ?? '', due_date: old?.due_date ?? null,
        status: old?.status ?? 'todo', completed_at: old?.completed_at ?? null, hours: old?.hours ?? null, assignee_member_id: old ? old.assignee_member_id : ctx.me,
        source_note_id: old?.source_note_id ?? null } as Pick<TaskFull, 'project_id' | 'goal_id' | 'title' | 'description' | 'due_date' | 'status' | 'completed_at' | 'hours' | 'assignee_member_id' | 'source_note_id'>;
      const tsig = (x: typeof t) => JSON.stringify([x.project_id, x.goal_id, x.title, x.description, x.due_date, x.status, x.completed_at, num(x.hours), x.assignee_member_id, x.source_note_id]);
      const was = tsig({ ...t, title: old?.title ?? title });
      if (!old) C.tasks.add++;
      if (has(r, 'Project')) {
        const pn = str(val(r, 'Project'));
        if (!pn) t.project_id = null;
        else { let p = projByName(pn); if (!p) { p = await newProject(pn); W.push(`Created project “${pn}” (used by task “${title}”).`); } if (t.project_id !== p.id) t.source_note_id = null; t.project_id = p.id; }
      }
      if (has(r, 'Goal')) { const gt = str(val(r, 'Goal')); if (!gt) t.goal_id = null; else { const g = goalByTitle(gt) ?? G.find(x => x.id === gt); if (g) t.goal_id = g.id; else W.push(`Task “${title}”: no goal called “${gt}”, so it was not linked.`); } }
      if (has(r, 'Assignee')) t.assignee_member_id = person(str(val(r, 'Assignee')), `Task “${title}”`);
      const collabs = has(r, 'Collaborators') ? people(val(r, 'Collaborators'), `Task “${title}”`).filter(x => x !== t.assignee_member_id) : null;
      const due = date(r, 'Due date', title); if (due !== undefined) t.due_date = due || null;
      const st = lc(val(r, 'Status'));
      if (st) { const m = STATUSES.find(x => lc(x.label) === st || x.id === st) ?? (/done|complet|hecho/.test(st) ? STATUSES[2] : /progress|doing|curso/.test(st) ? STATUSES[1] : STATUSES[0]); t.status = m.id; }
      const ca = date(r, 'Completed on', title); if (ca !== undefined) t.completed_at = ca || null;
      if (t.status === 'done' && !t.completed_at) t.completed_at = t.due_date && t.due_date <= todayISO() ? t.due_date : todayISO();
      if (t.status !== 'done') t.completed_at = null;
      if (has(r, 'Hours')) { const h = str(val(r, 'Hours')).replace(',', '.'); if (h === '') t.hours = null; else if (isFinite(+h) && +h >= 0) t.hours = +h; else W.push(`Task “${title}”: hours “${h}” is not a number.`); }
      if (has(r, 'Description')) t.description = str(val(r, 'Description'));
      const values: [string, string | null][] = [];
      for (const dim of dims) if (has(r, dim.name)) values.push([dim.id, await optFor(dim, str(val(r, dim.name)))]);
      const subs = has(r, 'Subtasks') ? str(val(r, 'Subtasks')).split(/\r?\n/).map(x => x.trim()).filter(Boolean).map(line => {
        const m = line.match(/^\[( |x|X)?\]\s*(.*)$/); return { title: m ? m[2] : line, done: m ? lc(m[1] || '') === 'x' : !!old?.subtasks.find(s => s.title === line)?.done }; }) : null;
      const rowChanged = !old || tsig(t) !== was;
      const collabsChanged = !!collabs && sorted(collabs) !== sorted(old?.collaborator_ids ?? []);
      const changedValues = values.filter(([fid, oid]) => (old ? d.taskVals.get(old.id)?.get(fid) ?? null : null) !== oid);
      const subsChanged = !!subs && !(old ? old.subtasks.length === subs.length && old.subtasks.every((x, i) => x.title === subs[i].title && x.done === subs[i].done) : subs.length === 0);
      if (old) { if (rowChanged || collabsChanged || changedValues.length || subsChanged) C.tasks.upd++; else C.tasks.same++; }
      if (apply) {
        let tid = old?.id;
        if (old) { if (rowChanged) check(await db().from('tasks').update(t).eq('id', old.id).select('id').single()); }
        else { tid = crypto.randomUUID(); check(await db().from('tasks').insert({ id: tid, workspace_id: ctx.ws, created_by_member: ctx.me, ...t })); }
        if (collabs && collabsChanged) await syncLinks('task_collaborators', 'task_id', tid!, 'member_id', old?.collaborator_ids ?? [], collabs);
        for (const [fid, oid] of changedValues) {
          if (oid) check(await db().from('task_values').upsert({ task_id: tid, field_id: fid, option_id: oid, value: null }));
          else check(await db().from('task_values').delete().eq('task_id', tid!).eq('field_id', fid));
        }
        if (subs && subsChanged) {
          if (old?.subtasks.length) check(await db().from('subtasks').delete().eq('task_id', tid!));
          if (subs.length) check(await db().from('subtasks').insert(subs.map((x, i) => ({ task_id: tid, title: x.title, done: x.done, position: i }))));
        }
      }
    } catch (e) { fail(`Task “${title}”`, e); }
    tick();
  }
  return { C, W, failed };
}

// ---------------------------------------------------------------- full backup

const BACKUP_KIND = 'goose-workspace-backup';
export interface Backup {
  kind: typeof BACKUP_KIND; version: 1; exported_at: string;
  workspace: { name: string };
  [table: string]: unknown;
}
type Row = Record<string, unknown>;

/** Every row of the workspace this person can see, as one JSON file. */
export async function buildBackup(ws: string, wsName: string): Promise<Backup> {
  const own = (t: string) => db().from(t).select('*').eq('workspace_id', ws);
  // link tables have no workspace column: filter through their parent row, and drop the joined parent again
  const via = (t: string, parent: string) => db().from(t).select(`*, ${parent}!inner(workspace_id)`).eq(`${parent}.workspace_id`, ws);
  const strip = (rows: Row[], parent: string) => rows.map(r => { const { [parent]: _drop, ...rest } = r; void _drop; return rest; });
  const own_t = ['workspace_members', 'teams', 'fields', 'field_options', 'goals', 'projects', 'notes', 'tasks'];
  const links: [string, string][] = [['team_members', 'teams'], ['project_members', 'projects'], ['project_teams', 'projects'], ['goal_projects', 'goals'],
    ['project_defaults', 'projects'], ['project_fields', 'projects'], ['task_collaborators', 'tasks'], ['task_values', 'tasks'], ['subtasks', 'tasks']];
  const res = await Promise.all([...own_t.map(own), ...links.map(([t, p]) => via(t, p))]);
  const out: Backup = { kind: BACKUP_KIND, version: 1, exported_at: new Date().toISOString(), workspace: { name: wsName } };
  own_t.forEach((t, i) => { out[t] = check(res[i]) as Row[]; });
  links.forEach(([t, p], i) => { out[t] = strip(check(res[own_t.length + i]) as Row[], p); });
  // comments (absent until their database update is run)
  const cq = await own('comments');
  out.comments = cq.error ? [] : cq.data as Row[];
  // people: keep who they were, not their sign-in links
  out.workspace_members = (out.workspace_members as Row[]).map(m => ({ id: m.id, email: m.email, display_name: m.display_name, title: m.title, access: m.access, color: m.color }));
  return out;
}

export async function downloadBackup(ws: string, wsName: string) {
  const b = await buildBackup(ws, wsName);
  download(`${slug(wsName)}-backup-${todayISO()}.json`, JSON.stringify(b, null, 1), 'application/json');
}

export interface BackupSummary { name: string; exported: string; counts: [string, number][]; people: string[] }
export function readBackup(text: string): { backup: Backup; summary: BackupSummary } {
  let b: Backup;
  try { b = JSON.parse(text); } catch { throw new Error('This file is not a Goose backup. Choose the .json file that Download backup saved.'); }
  if (!b || b.kind !== BACKUP_KIND) throw new Error('This file is not a Goose backup. Choose the .json file that Download backup saved.');
  if (b.version !== 1) throw new Error('This backup comes from a newer version of Goose. Reload the page and try again.');
  const n = (t: string) => ((b[t] as Row[] | undefined) ?? []).length;
  return { backup: b, summary: { name: b.workspace?.name ?? 'Workspace', exported: b.exported_at,
    counts: [[n('goals'), 'goal', 'goals'], [n('projects'), 'project', 'projects'], [n('tasks'), 'task', 'tasks'], [n('notes'), 'notebook entry', 'notebook entries'], [n('comments'), 'comment', 'comments'],
      [((b.fields as Row[]) ?? []).filter(f => f.is_dimension).length, 'dimension', 'dimensions']].map(([k, one, many]) => [k === 1 ? one : many, k] as [string, number]),
    people: ((b.workspace_members as Row[]) ?? []).map(m => String(m.display_name)) } };
}

/**
 * Restores a backup as a NEW workspace, so nothing existing is ever overwritten.
 * You become its admin. Other people are not added (adding them would invite them);
 * their projects and goals become yours and their tasks are left unassigned.
 */
export async function restoreBackup(b: Backup, name: string, me_: { uid: string; email: string }, progress?: (step: string) => void): Promise<{ wsId: string; notAdded: string[] }> {
  const rows = (t: string) => ((b[t] as Row[] | undefined) ?? []);
  progress?.('Creating the workspace');
  const { data: wsId, error } = await db().rpc('create_workspace', { p_name: name });
  if (error) throw new Error(/function .*create_workspace/i.test(error.message) ? 'New workspaces need a one-time database update first.' : error.message);
  const ws = wsId as string;
  const meRow = check(await db().from('workspace_members').select('id').eq('workspace_id', ws).eq('user_id', me_.uid).single()) as { id: string };
  const me = meRow.id;
  const ids = new Map<string, string>();
  const map = (old: unknown) => (old == null ? null : ids.get(String(old)) ?? null);
  const fresh = (old: unknown) => { const n = crypto.randomUUID(); ids.set(String(old), n); return n; };
  const insert = async (table: string, list: Row[]) => {
    for (let i = 0; i < list.length; i += 400) check(await db().from(table).insert(list.slice(i, i + 400)));
  };

  // people: only you come along
  const notAdded: string[] = [];
  for (const m of rows('workspace_members')) {
    if (String(m.email).toLowerCase() === me_.email.toLowerCase()) ids.set(String(m.id), me);
    else notAdded.push(String(m.display_name));
  }
  const person = (old: unknown) => map(old);

  // dimensions: the new workspace already has Priority; match by name, then options by label
  progress?.('Dimensions');
  const have = check(await db().from('fields').select('id, name').eq('workspace_id', ws)) as { id: string; name: string }[];
  const haveOpts = check(await db().from('field_options').select('id, field_id, label').eq('workspace_id', ws)) as { id: string; field_id: string; label: string }[];
  const newFields: Row[] = [], newOpts: Row[] = [];
  for (const f of rows('fields')) {
    const same = have.find(h => h.name.toLowerCase() === String(f.name).toLowerCase());
    if (same) ids.set(String(f.id), same.id);
    else newFields.push({ id: fresh(f.id), workspace_id: ws, name: f.name, type: f.type, is_dimension: f.is_dimension, builtin: false, position: f.position });
  }
  await insert('fields', newFields);
  for (const o of rows('field_options')) {
    const fid = map(o.field_id); if (!fid) continue;
    const same = haveOpts.find(h => h.field_id === fid && h.label.toLowerCase() === String(o.label).toLowerCase());
    if (same) ids.set(String(o.id), same.id);
    else newOpts.push({ id: fresh(o.id), field_id: fid, workspace_id: ws, label: o.label, color: o.color, position: o.position });
  }
  await insert('field_options', newOpts);

  progress?.('Teams and projects');
  await insert('teams', rows('teams').map(t => ({ id: fresh(t.id), workspace_id: ws, name: t.name, color: t.color, image_path: t.image_path ?? null, lead_member_id: person(t.lead_member_id) })));
  await insert('team_members', rows('team_members').filter(x => map(x.team_id) && person(x.member_id)).map(x => ({ team_id: map(x.team_id), member_id: person(x.member_id) })));
  await insert('projects', rows('projects').map(p => ({ id: fresh(p.id), workspace_id: ws, name: p.name, color: p.color, icon: p.icon, image_path: p.image_path ?? null, image_fit: p.image_fit ?? 'fit',
    kind: p.kind, status: p.status, start_date: p.start_date, end_date: p.end_date, owner_member_id: person(p.owner_member_id) ?? me, created_at: p.created_at })));
  await insert('project_members', rows('project_members').filter(x => map(x.project_id) && person(x.member_id) && person(x.member_id) !== me).map(x => ({ project_id: map(x.project_id), member_id: person(x.member_id) })));
  await insert('project_teams', rows('project_teams').filter(x => map(x.project_id) && map(x.team_id)).map(x => ({ project_id: map(x.project_id), team_id: map(x.team_id) })));
  await insert('project_defaults', rows('project_defaults').filter(x => map(x.project_id) && map(x.field_id) && map(x.option_id)).map(x => ({ project_id: map(x.project_id), field_id: map(x.field_id), option_id: map(x.option_id) })));
  await insert('project_fields', rows('project_fields').filter(x => map(x.project_id) && map(x.field_id)).map(x => ({ project_id: map(x.project_id), field_id: map(x.field_id) })));

  progress?.('Goals');
  const goals = rows('goals');
  const goalRow = (g: Row) => ({ id: fresh(g.id), workspace_id: ws, title: g.title, start_date: g.start_date, end_date: g.end_date, status: g.status, manual_progress: g.manual_progress,
    notes: g.notes ?? '', owner_member_id: person(g.owner_member_id) ?? me, created_at: g.created_at,
    short_name: g.short_name ?? '', color: g.color ?? null, ...(g.icon ? { icon: g.icon } : {}), ...(g.scene ? { scene: g.scene } : {}) });
  await insert('goals', goals.filter(g => !g.parent_id).map(goalRow));
  await insert('goals', goals.filter(g => g.parent_id && map(g.parent_id)).map(g => ({ ...goalRow(g), parent_id: map(g.parent_id) })));
  await insert('goal_projects', rows('goal_projects').filter(x => map(x.goal_id) && map(x.project_id)).map(x => ({ goal_id: map(x.goal_id), project_id: map(x.project_id) })));

  progress?.('Notebooks');
  await insert('notes', rows('notes').filter(n => map(n.project_id)).map(n => ({ id: fresh(n.id), workspace_id: ws, project_id: map(n.project_id), entry_date: n.entry_date, kind: n.kind, body: n.body,
    created_by_member: me, created_at: n.created_at })));

  progress?.('Tasks');
  await insert('tasks', rows('tasks').map(t => ({ id: fresh(t.id), workspace_id: ws, project_id: map(t.project_id), goal_id: map(t.goal_id), title: t.title, description: t.description ?? '',
    due_date: t.due_date, status: t.status, completed_at: t.completed_at, hours: t.hours, assignee_member_id: person(t.assignee_member_id), created_by_member: me,
    source_note_id: map(t.source_note_id), source_line: t.source_line ?? null, created_at: t.created_at,
    // open repeating tasks keep repeating; finished ones are history
    ...(t.status !== 'done' && t.repeat ? { repeat: t.repeat } : {}) })));
  await insert('subtasks', rows('subtasks').filter(s => map(s.task_id)).map(s => ({ task_id: map(s.task_id), title: s.title, done: s.done, position: s.position })));
  await insert('task_collaborators', rows('task_collaborators').filter(x => map(x.task_id) && person(x.member_id)).map(x => ({ task_id: map(x.task_id), member_id: person(x.member_id) })));
  // comments: written in your name (the database only lets you add your own), with the original author named
  const names = new Map(rows('workspace_members').map(m => [String(m.id), String(m.display_name)]));
  if (rows('comments').length) {
    const cs = rows('comments').filter(c => (c.task_id && map(c.task_id)) || (c.note_id && map(c.note_id))).map(c => ({
      workspace_id: ws, task_id: map(c.task_id), note_id: map(c.note_id), author_member_id: me, created_at: c.created_at, edited_at: c.edited_at ?? null,
      mentions: ((c.mentions as string[] | undefined) ?? []).map(person).filter(Boolean),
      body: person(c.author_member_id) === me ? c.body : `${names.get(String(c.author_member_id)) ?? 'Someone'} wrote: ${c.body}` }));
    try { await insert('comments', cs); } catch { /* comments need their database update; the rest is restored */ }
  }
  await insert('task_values', rows('task_values').filter(x => map(x.task_id) && map(x.field_id) && (x.option_id == null || map(x.option_id)))
    .map(x => ({ task_id: map(x.task_id), field_id: map(x.field_id), option_id: map(x.option_id), value: x.value ?? null })));
  return { wsId: ws, notAdded };
}
