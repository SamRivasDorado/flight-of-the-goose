/**
 * Prototype mode: a stand-in for Supabase that runs entirely in the browser.
 *
 * It answers the same calls the app makes (tables, the few database functions, sign-in,
 * picture storage) from sample data kept in this browser, so the prototype runs the very
 * same app code as the live Goose without touching the real database. You are always
 * signed in as the sample admin. Nothing here is used by the live build.
 */
import { nextDue, type Repeat } from '../lib/repeat';
import type { SupabaseClient } from '@supabase/supabase-js';
import { makeSeed } from './seed';

type Row = Record<string, unknown>;
type Store = { tables: Record<string, Row[]>; files: Record<string, string> };

export const DEMO_UID = '00000000-0000-4000-8000-000000000001';
export const DEMO_EMAIL = 'sam@example.com';
const KEY = 'goose.demo.v10';

const PK: Record<string, string[]> = {
  team_members: ['team_id', 'member_id'], project_members: ['project_id', 'member_id'], project_teams: ['project_id', 'team_id'],
  goal_projects: ['goal_id', 'project_id'], project_defaults: ['project_id', 'field_id'], project_fields: ['project_id', 'field_id'],
  task_collaborators: ['task_id', 'member_id'], task_values: ['task_id', 'field_id'], member_settings: ['member_id'],
};
const pkOf = (t: string) => PK[t] ?? ['id'];

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const now = () => new Date().toISOString();

/** Column defaults, as in the migrations. */
const DEFAULTS: Record<string, () => Row> = {
  workspaces: () => ({ created_by: null, created_at: now(), solo: false }),
  workspace_members: () => ({ user_id: null, title: '', access: 'member', status: 'invited', color: '#5B83B5', invited_by: null, created_at: now(), avatar_url: null, invite_emailed_at: null }),
  teams: () => ({ image_path: null, lead_member_id: null, created_at: now() }),
  fields: () => ({ type: 'select', is_dimension: true, builtin: false, position: 0 }),
  field_options: () => ({ position: 0 }),
  goals: () => ({ parent_id: null, start_date: today(), end_date: null, status: 'on_track', manual_progress: 0, notes: '', owner_member_id: null, created_at: now() }),
  projects: () => ({ icon: 'folder', image_path: null, image_fit: 'fit', kind: 'ongoing', status: 'active', start_date: null, end_date: null, owner_member_id: null, created_at: now(), completed_at: null }),
  notes: () => ({ entry_date: today(), kind: 'note', created_by_member: null, created_at: now() }),
  tasks: () => ({ project_id: null, goal_id: null, title: '', description: '', due_date: null, status: 'todo', completed_at: null, hours: null, assignee_member_id: null,
    created_by_member: null, source_note_id: null, source_line: null, created_at: now(), repeat: null, next_task_id: null }),
  subtasks: () => ({ done: false, position: 0 }),
  task_values: () => ({ option_id: null, value: null }),
  member_settings: () => ({ settings: {} }),
  help_offers: () => ({ status: 'offered', message: '', created_at: now(), answered_at: null }),
  mention_events: () => ({ author_member_id: null, task_id: null, note_id: null, excerpt: '', created_at: now() }),
  comments: () => ({ task_id: null, note_id: null, author_member_id: null, mentions: [], created_at: now(), edited_at: null }),
  profiles: () => ({ full_name: '', title: '', color: null, avatar_url: null, setup_done: false, created_at: now() }),
};

/** What happens to other rows when a row is deleted (foreign keys). */
const ON_DELETE: Record<string, [string, string, 'cascade' | 'null'][]> = {
  workspaces: [['workspace_members', 'workspace_id', 'cascade'], ['teams', 'workspace_id', 'cascade'], ['fields', 'workspace_id', 'cascade'], ['goals', 'workspace_id', 'cascade'],
    ['projects', 'workspace_id', 'cascade'], ['notes', 'workspace_id', 'cascade'], ['tasks', 'workspace_id', 'cascade'], ['comments', 'workspace_id', 'cascade'], ['mention_events', 'workspace_id', 'cascade'], ['help_offers', 'workspace_id', 'cascade']],
  workspace_members: [['team_members', 'member_id', 'cascade'], ['project_members', 'member_id', 'cascade'], ['task_collaborators', 'member_id', 'cascade'],
    ['member_settings', 'member_id', 'cascade'], ['teams', 'lead_member_id', 'null'], ['goals', 'owner_member_id', 'null'], ['projects', 'owner_member_id', 'null'],
    ['notes', 'created_by_member', 'null'], ['comments', 'author_member_id', 'null'], ['mention_events', 'member_id', 'cascade'], ['mention_events', 'author_member_id', 'null'], ['help_offers', 'helper_member_id', 'cascade'], ['help_offers', 'helped_member_id', 'cascade'], ['tasks', 'assignee_member_id', 'null'], ['tasks', 'created_by_member', 'null'], ['workspace_members', 'invited_by', 'null']],
  teams: [['team_members', 'team_id', 'cascade'], ['project_teams', 'team_id', 'cascade']],
  fields: [['field_options', 'field_id', 'cascade'], ['project_defaults', 'field_id', 'cascade'], ['project_fields', 'field_id', 'cascade'], ['task_values', 'field_id', 'cascade']],
  field_options: [['project_defaults', 'option_id', 'cascade'], ['task_values', 'option_id', 'cascade']],
  goals: [['goals', 'parent_id', 'cascade'], ['goal_projects', 'goal_id', 'cascade'], ['tasks', 'goal_id', 'null']],
  projects: [['project_members', 'project_id', 'cascade'], ['project_teams', 'project_id', 'cascade'], ['goal_projects', 'project_id', 'cascade'],
    ['project_defaults', 'project_id', 'cascade'], ['project_fields', 'project_id', 'cascade'], ['notes', 'project_id', 'cascade'], ['tasks', 'project_id', 'null']],
  notes: [['tasks', 'source_note_id', 'null'], ['comments', 'note_id', 'cascade'], ['mention_events', 'note_id', 'cascade']],
  tasks: [['subtasks', 'task_id', 'cascade'], ['task_collaborators', 'task_id', 'cascade'], ['task_values', 'task_id', 'cascade'], ['comments', 'task_id', 'cascade'], ['mention_events', 'task_id', 'cascade'], ['help_offers', 'task_id', 'cascade']],
};

// ---------------------------------------------------------------- the stored data

let S: Store;
function load(): Store {
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw) as Store; if (s?.tables) return s; } } catch { /* no storage */ }
  return { tables: makeSeed(DEMO_UID, DEMO_EMAIL), files: {} };
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* full or blocked: keeps working in memory */ } }
const T = (t: string) => (S.tables[t] ??= []);
const clone = <X,>(x: X): X => JSON.parse(JSON.stringify(x)) as X;

/** Starts again from fresh sample data. */
export function resetDemo() { try { localStorage.removeItem(KEY); localStorage.removeItem('pt.lastWorkspace'); } catch { /* ignore */ } location.hash = '#/timeline'; location.reload(); }

function removeRows(table: string, pred: (r: Row) => boolean) {
  const gone = T(table).filter(pred);
  if (!gone.length) return;
  S.tables[table] = T(table).filter(r => !pred(r));
  for (const [child, col, how] of ON_DELETE[table] ?? []) {
    const ids = new Set(gone.map(r => r.id));
    if (how === 'cascade') removeRows(child, r => ids.has(r[col]));
    else T(child).forEach(r => { if (ids.has(r[col])) r[col] = null; });
  }
}

/** A repeating task that is completed gets its next one (the live database does this with a trigger). */
function nextOccurrence(row: Row, old: Row) {
  if (row.status !== 'done' || old.status === 'done' || !row.repeat || row.next_task_id) return;
  const r = row.repeat as Repeat, nd = nextDue(r, (row.due_date as string | null) ?? null, String(row.completed_at ?? today()).slice(0, 10));
  if (!nd) return;
  const id = crypto.randomUUID();
  T('tasks').push({ ...DEFAULTS.tasks(), id, workspace_id: row.workspace_id, project_id: row.project_id, goal_id: row.goal_id, title: row.title, description: row.description,
    due_date: nd, status: 'todo', assignee_member_id: row.assignee_member_id, created_by_member: row.created_by_member, repeat: r.left != null ? { ...r, left: r.left - 1 } : r });
  T('task_collaborators').filter(c => c.task_id === row.id).forEach(c => T('task_collaborators').push({ ...c, task_id: id }));
  T('task_values').filter(v => v.task_id === row.id).forEach(v => T('task_values').push({ ...v, task_id: id }));
  T('subtasks').filter(x => x.task_id === row.id).forEach(x => T('subtasks').push({ ...x, id: crypto.randomUUID(), task_id: id, done: false }));
  row.next_task_id = id;
}

/** Projects record when they were finished (the live database does this with a trigger). */
function projectTrigger(row: Row, old: Row | null) {
  if (row.status !== 'closed') row.completed_at = null;
  else if (old && old.status === 'closed') row.completed_at = row.completed_at ?? old.completed_at ?? null;
  else row.completed_at = row.completed_at ?? today();
}

type Res = { data: unknown; error: { message: string; code?: string } | null };
const fail = (message: string, code?: string): Res => ({ data: null, error: { message, code } });

// ---------------------------------------------------------------- query builder

class Query implements PromiseLike<Res> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private cols = '*';
  private returning = false;
  private filters: ((r: Row) => boolean)[] = [];
  private orders: { col: string; asc: boolean; nullsFirst: boolean }[] = [];
  private lim: number | null = null;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private payload: Row | Row[] | null = null;
  constructor(private table: string) {}

  select(cols = '*') { if (this.op !== 'select') this.returning = true; this.cols = cols; return this; }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = rows; return this; }
  upsert(rows: Row | Row[]) { this.op = 'upsert'; this.payload = rows; return this; }
  update(patch: Row) { this.op = 'update'; this.payload = patch; return this; }
  delete() { this.op = 'delete'; return this; }
  private val(r: Row, col: string) { if (!col.includes('.')) return r[col]; const [rel, c] = col.split('.'); return (this.joined(r, rel) as Row | null)?.[c]; }
  eq(col: string, v: unknown) { this.filters.push(r => this.val(r, col) === v); return this; }
  neq(col: string, v: unknown) { this.filters.push(r => this.val(r, col) !== v); return this; }
  in(col: string, vs: unknown[]) { const set = new Set(vs); this.filters.push(r => set.has(this.val(r, col))); return this; }
  gte(col: string, v: string) { this.filters.push(r => String(this.val(r, col) ?? '') >= v); return this; }
  lte(col: string, v: string) { this.filters.push(r => String(this.val(r, col) ?? '') <= v); return this; }
  is(col: string, v: null) { this.filters.push(r => this.val(r, col) == v); return this; }
  not(col: string, op: string, v: unknown) { if (op === 'is' && v === null) this.filters.push(r => this.val(r, col) != null); else this.filters.push(r => this.val(r, col) !== v); return this; }
  order(col: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) { const asc = o.ascending !== false; this.orders.push({ col, asc, nullsFirst: o.nullsFirst ?? !asc }); return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }

  /** "parent!inner(col)" in a select: the parent row this link row points to. */
  private joined(r: Row, rel: string) {
    const fk = `${rel.replace(/s$/, '')}_id`;
    return T(rel).find(p => p.id === r[fk]) ?? null;
  }
  private project(r: Row): Row {
    const c = this.cols.replace(/\s+/g, ' ').trim();
    const joins = [...c.matchAll(/(\w+)!inner\(([^)]*)\)/g)];
    const plain = c.replace(/,?\s*\w+!inner\([^)]*\)/g, '').split(',').map(x => x.trim()).filter(Boolean);
    const out: Row = plain.includes('*') ? { ...r } : Object.fromEntries(plain.map(k => [k, r[k] ?? null]));
    for (const [, rel, inner] of joins) {
      const p = this.joined(r, rel);
      out[rel] = p ? Object.fromEntries(inner.split(',').map(x => x.trim()).map(k => [k, p[k] ?? null])) : null;
    }
    return clone(out);
  }
  private sorted(rows: Row[]) {
    if (!this.orders.length) return rows;
    return [...rows].sort((a, b) => {
      for (const o of this.orders) {
        const x = a[o.col], y = b[o.col];
        if (x === y) continue;
        if (x == null) return o.nullsFirst ? -1 : 1;
        if (y == null) return o.nullsFirst ? 1 : -1;
        const c = String(x).localeCompare(String(y), 'en', { numeric: true, sensitivity: 'base' });
        if (c) return o.asc ? c : -c;
      }
      return 0;
    });
  }
  private shape(rows: Row[]): Res {
    const out = rows.map(r => this.project(r));
    if (this.mode === 'many') return { data: out, error: null };
    if (out.length === 1) return { data: out[0], error: null };
    if (!out.length && this.mode === 'maybe') return { data: null, error: null };
    return fail('JSON object requested, multiple (or no) rows returned', 'PGRST116');
  }
  private match(r: Row) { return this.filters.every(f => f(r)); }
  private fill(row: Row): Row {
    const r = { ...(DEFAULTS[this.table]?.() ?? {}), ...row };
    if (pkOf(this.table)[0] === 'id' && !r.id) r.id = crypto.randomUUID();
    return r;
  }
  private dup(r: Row, rows: Row[]) {
    const pk = pkOf(this.table);
    if (rows.some(x => pk.every(k => x[k] === r[k]))) return fail(`duplicate key value violates unique constraint "${this.table}_pkey"`, '23505');
    if (this.table === 'workspace_members' && rows.some(x => x.workspace_id === r.workspace_id && String(x.email).toLowerCase() === String(r.email).toLowerCase()))
      return fail('duplicate key value violates unique constraint "workspace_members_workspace_id_email_key"', '23505');
    return null;
  }

  private run(): Res {
    const rows = T(this.table);
    if (this.op === 'select') {
      let out = this.sorted(rows.filter(r => this.match(r)));
      if (this.lim != null) out = out.slice(0, this.lim);
      return this.shape(out);
    }
    if (this.op === 'insert' || this.op === 'upsert') {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map(r => this.fill(r));
      const done: Row[] = [];
      for (const r of list) {
        const pk = pkOf(this.table);
        const old = rows.find(x => pk.every(k => x[k] === r[k]));
        if (this.op === 'upsert' && old) { if (this.table === 'projects') projectTrigger(r, old); Object.assign(old, r); done.push(old); continue; }
        const d = this.dup(r, rows); if (d) return d;
        if (this.table === 'projects') projectTrigger(r, null);
        rows.push(r); done.push(r);
      }
      persist();
      return this.returning ? this.shape(done) : { data: null, error: null };
    }
    if (this.op === 'update') {
      const hit = rows.filter(r => this.match(r));
      for (const r of hit) { const old = { ...r }; Object.assign(r, this.payload); if (this.table === 'projects') projectTrigger(r, old); if (this.table === 'tasks') nextOccurrence(r, old);
        if (this.table === 'help_offers' && r.status !== old.status) r.answered_at = now(); }
      persist();
      return this.returning ? this.shape(hit) : { data: null, error: null };
    }
    const hit = rows.filter(r => this.match(r));
    removeRows(this.table, r => this.match(r));
    persist();
    return this.returning ? this.shape(hit) : { data: null, error: null };
  }

  then<A = Res, B = never>(ok?: ((v: Res) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    let res: Res;
    try { res = this.run(); } catch (e) { res = fail(e instanceof Error ? e.message : String(e)); }
    // a short pause, like a real round trip, so loading states behave as they do live
    return new Promise<Res>(r => setTimeout(() => r(res), 15)).then(ok, bad);
  }
}

// ---------------------------------------------------------------- database functions

function myWorkspaces() {
  return T('workspace_members').filter(m => m.user_id === DEMO_UID && m.status === 'active')
    .map(m => ({ m, w: T('workspaces').find(w => w.id === m.workspace_id)! })).filter(x => x.w)
    .sort((a, b) => String(a.w.created_at).localeCompare(String(b.w.created_at)))
    .map(({ m, w }) => ({ workspace_id: w.id, workspace_name: w.name, member_id: m.id, access: m.access }));
}

function rpc(fn: string, a: Row = {}): Res {
  const profile = T('profiles').find(p => p.id === DEMO_UID)!;
  switch (fn) {
    case 'on_login': return { data: myWorkspaces(), error: null };
    case 'create_workspace': {
      const name = String(a.p_name ?? '').trim();
      if (!name) return fail('Give the workspace a name.');
      const ws = { id: crypto.randomUUID(), name, created_by: DEMO_UID, created_at: now(), solo: false };
      T('workspaces').push(ws);
      T('workspace_members').push({ ...DEFAULTS.workspace_members(), id: crypto.randomUUID(), workspace_id: ws.id, user_id: DEMO_UID, email: DEMO_EMAIL,
        display_name: profile.full_name || 'You', title: profile.title ?? '', access: 'admin', status: 'active', color: profile.color ?? '#5B83B5', avatar_url: profile.avatar_url ?? null });
      const prio = { id: crypto.randomUUID(), workspace_id: ws.id, name: 'Priority', type: 'select', is_dimension: true, builtin: true, position: 0 };
      T('fields').push(prio);
      [['High', '#D0453A'], ['Medium', '#8E5CC2'], ['Low', '#4A7FC1']].forEach(([label, color], i) =>
        T('field_options').push({ id: crypto.randomUUID(), field_id: prio.id, workspace_id: ws.id, label, color, position: i }));
      persist();
      return { data: ws.id, error: null };
    }
    case 'save_my_profile': {
      Object.assign(profile, { full_name: String(a.p_name ?? '').trim(), title: a.p_title ?? '', color: a.p_color ?? profile.color, avatar_url: a.p_avatar_url ?? null, setup_done: true });
      T('workspace_members').filter(m => m.user_id === DEMO_UID).forEach(m => Object.assign(m, { display_name: profile.full_name, title: profile.title, color: profile.color ?? m.color, avatar_url: profile.avatar_url }));
      persist();
      return { data: null, error: null };
    }
    case 'save_my_membership': {
      const m = T('workspace_members').find(x => x.workspace_id === a.p_ws && x.user_id === DEMO_UID);
      if (!m) return fail('You are not in that workspace.');
      Object.assign(m, { display_name: String(a.p_name ?? '').trim(), title: a.p_title ?? '', color: a.p_color ?? m.color, avatar_url: a.p_avatar_url ?? null });
      persist();
      return { data: null, error: null };
    }
    case 'resend_invitation': return { data: null, error: null };
    default: return fail(`function ${fn} does not exist in the prototype`);
  }
}

// ---------------------------------------------------------------- sign-in and pictures

const session = {
  access_token: 'demo', refresh_token: 'demo', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800,
  user: { id: DEMO_UID, email: DEMO_EMAIL, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { full_name: 'Sam Rivas' }, created_at: '2026-01-01T00:00:00Z' },
};

function note(msg: string) {
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3500);
}

async function toDataUrl(body: unknown, type: string): Promise<string> {
  const blob = body instanceof Blob ? body : new Blob([body as ArrayBuffer], { type });
  return await new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
}

export function createDemoClient(): SupabaseClient {
  S = load();
  persist();
  const client = {
    from: (t: string) => new Query(t),
    rpc: (fn: string, args?: Row) => new Promise<Res>(r => setTimeout(() => r(rpc(fn, args)), 15)),
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: session.user }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() { /* nothing */ } } } }),
      signOut: async () => { note('This is the prototype, so you stay signed in. Use “Reset sample data” on the goose button to start again.'); return { error: null }; },
      updateUser: async () => ({ data: {}, error: null }),
      signInWithOtp: async () => ({ data: {}, error: null }),
      signInWithPassword: async () => ({ data: {}, error: null }),
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: unknown, o: { contentType?: string } = {}) => {
          S.files[`${bucket}/${path}`] = await toDataUrl(body, o.contentType ?? 'image/webp'); persist();
          return { data: { path }, error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: S.files[`${bucket}/${path}`] ?? '' } }),
        remove: async (paths: string[]) => { paths.forEach(p => delete S.files[`${bucket}/${p}`]); persist(); return { data: null, error: null }; },
      }),
    },
  };
  return client as unknown as SupabaseClient;
}
