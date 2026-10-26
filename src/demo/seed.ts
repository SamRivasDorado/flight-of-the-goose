/**
 * Sample data for the prototype: a small geoscience consultancy with a year of history,
 * so every screen (and the quarterly legs on Strategy) has something real to show.
 * Dates are relative to today; the pseudo-random choices are fixed, so every reset looks the same.
 */
type Row = Record<string, unknown>;

let seedN = 7;
const rnd = () => { seedN = (seedN * 1103515245 + 12345) % 2147483648; return seedN / 2147483648; };
const pick = <X,>(a: X[]) => a[Math.floor(rnd() * a.length)];
const uid = () => crypto.randomUUID();
const day = (offset: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
const stamp = (offset: number) => `${day(offset)}T09:00:00.000Z`;

export function makeSeed(myUid: string, myEmail: string): Record<string, Row[]> {
  seedN = 7;
  const ws = uid();
  const t: Record<string, Row[]> = {
    profiles: [{ id: myUid, full_name: 'Sam Rivas', title: 'Senior Geoscientist', color: '#4F86C6', avatar_url: null, setup_done: true, created_at: stamp(-400) }],
    workspaces: [{ id: ws, name: 'Rivas Geoscience (sample)', created_by: myUid, created_at: stamp(-400), solo: false }],
    workspace_members: [], teams: [], team_members: [], fields: [], field_options: [], goals: [], projects: [], project_members: [], project_teams: [],
    goal_projects: [], project_defaults: [], project_fields: [], notes: [], tasks: [], task_collaborators: [], task_values: [], subtasks: [], member_settings: [],
  };

  // ---- people
  const P = (name: string, title: string, access: string, color: string, me = false) => {
    const id = uid();
    t.workspace_members.push({ id, workspace_id: ws, user_id: me ? myUid : null, email: me ? myEmail : `${name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}@example.com`,
      display_name: name, title, access, status: 'active', color, invited_by: null, created_at: stamp(-400), avatar_url: null, invite_emailed_at: null });
    return id;
  };
  const sam = P('Sam Rivas', 'Senior Geoscientist', 'admin', '#4F86C6', true);
  const lucia = P('Lucía Navarro', 'Project Manager', 'manager', '#D46A8C');
  const omar = P('Omar Haddad', 'Reservoir Engineer', 'member', '#3BA39B');
  const elena = P('Elena Petrova', 'Geomodeller', 'member', '#8E6BBF');
  const karim = P('Karim Benali', 'Business Development, North Africa', 'manager', '#F28C28');
  const julia = P('Julia Weber', 'Client contact, ENAGAS', 'guest', '#6FA65A');
  const guestId = julia;

  // ---- teams
  const team = (name: string, color: string, lead: string, members: string[]) => {
    const id = uid(); t.teams.push({ id, workspace_id: ws, name, color, image_path: null, lead_member_id: lead, created_at: stamp(-390) });
    members.forEach(m => t.team_members.push({ team_id: id, member_id: m })); return id;
  };
  const tGeo = team('Geoscience consulting', '#3E9A94', sam, [sam, omar, elena]);
  const tNaf = team('North Africa BD', '#E39A3E', karim, [karim, sam, lucia]);
  const tTrain = team('Training and support', '#9A7EC0', lucia, [lucia, elena]);

  // ---- dimensions
  const dim = (name: string, builtin: boolean, position: number, opts: [string, string][]) => {
    const id = uid(); t.fields.push({ id, workspace_id: ws, name, type: 'select', is_dimension: true, builtin, position });
    const o: Record<string, string> = {};
    opts.forEach(([label, color], i) => { const oid = uid(); o[label] = oid; t.field_options.push({ id: oid, field_id: id, workspace_id: ws, label, color, position: i }); });
    return { id, o };
  };
  const prio = dim('Priority', true, 0, [['High', '#D0453A'], ['Medium', '#8E5CC2'], ['Low', '#4A7FC1']]);
  const region = dim('Region', false, 1, [['North Africa', '#E39A3E'], ['Europe', '#4F86C6'], ['Latin America', '#6FA65A'], ['Middle East', '#C9A877']]);
  const client = dim('Client', false, 2, [['Cairo University', '#D9572B'], ['ENAGAS', '#3BA39B'], ['IGME', '#A6A23E'], ['Cardon IV', '#8E6BBF'], ['Internal', '#8A9099']]);

  // ---- projects
  type Proj = { id: string; start: number; end: number | null; owner: string; people: string[] };
  const proj = (name: string, o: { color: string; icon: string; kind: 'fixed' | 'ongoing'; start: number; end?: number; owner: string; members?: string[]; teams?: string[];
    closed?: number; region?: string; client?: string; prio?: string }): Proj => {
    const id = uid();
    t.projects.push({ id, workspace_id: ws, name, color: o.color, icon: o.icon, image_path: null, image_fit: 'fit', kind: o.kind, status: o.closed != null ? 'closed' : 'active',
      start_date: day(o.start), end_date: o.kind === 'fixed' && o.end != null ? day(o.end) : null, owner_member_id: o.owner, created_at: stamp(o.start),
      completed_at: o.closed != null ? day(o.closed) : null });
    (o.members ?? []).forEach(m => t.project_members.push({ project_id: id, member_id: m }));
    (o.teams ?? []).forEach(x => t.project_teams.push({ project_id: id, team_id: x }));
    if (o.region) t.project_defaults.push({ project_id: id, field_id: region.id, option_id: region.o[o.region] });
    if (o.client) t.project_defaults.push({ project_id: id, field_id: client.id, option_id: client.o[o.client] });
    if (o.prio) t.project_defaults.push({ project_id: id, field_id: prio.id, option_id: prio.o[o.prio] });
    const teamPeople = (o.teams ?? []).flatMap(x => t.team_members.filter(m => m.team_id === x).map(m => String(m.member_id)));
    // guests (Julia) look but do not do the work
    return { id, start: o.start, end: o.kind === 'fixed' ? o.end ?? null : null, owner: o.owner, people: [...new Set([o.owner, ...(o.members ?? []), ...teamPeople])].filter(x => x !== guestId) };
  };
  const neag = proj('Neag field study', { color: '#4F86C6', icon: 'derrick', kind: 'fixed', start: -150, end: 60, owner: sam, members: [omar, elena], region: 'North Africa', client: 'Cairo University', prio: 'High' });
  const cardon = proj('Cardon IV final model', { color: '#8E6BBF', icon: 'layers', kind: 'fixed', start: -230, end: -15, owner: lucia, members: [sam, elena], closed: -12, region: 'Latin America', client: 'Cardon IV' });
  const genel = proj('Genel interim study', { color: '#A6A23E', icon: 'mountain', kind: 'fixed', start: -330, end: -75, owner: sam, members: [omar], closed: -80, region: 'Middle East' });
  const igme = proj('IGME basin review', { color: '#C9A877', icon: 'globe', kind: 'fixed', start: -390, end: -170, owner: sam, closed: -175, region: 'Europe', client: 'IGME' });
  const support = proj('Client support', { color: '#3BA39B', icon: 'lifebuoy', kind: 'ongoing', start: -400, owner: lucia, members: [omar], teams: [tTrain], client: 'Internal', prio: 'Medium' });
  const tnav = proj('Improving tNavigator workflows', { color: '#F2C230', icon: 'flask', kind: 'ongoing', start: -300, owner: sam, teams: [tGeo], region: 'Europe', client: 'Internal' });
  const enagas = proj('ENAGAS training', { color: '#6FA65A', icon: 'book', kind: 'fixed', start: -40, end: 50, owner: lucia, members: [sam, julia], region: 'Europe', client: 'ENAGAS' });
  const eage = proj('EAGE Annual 2027', { color: '#D46A8C', icon: 'mic', kind: 'fixed', start: -20, end: 240, owner: sam, region: 'Europe' });
  const nafbd = proj('North Africa business development', { color: '#F28C28', icon: 'briefcase', kind: 'ongoing', start: -200, owner: karim, teams: [tNaf], region: 'North Africa' });

  // ---- tasks: finished ones spread over the project's past, open ones ahead (a few overdue)
  const task = (p: Proj | null, title: string, o: { done?: number; due?: number | null; who?: string; status?: string; hours?: number | null; goal?: string; prio?: string; subs?: [string, boolean][]; desc?: string } = {}) => {
    const id = uid();
    const doneDay = o.done != null ? day(o.done) : null;
    t.tasks.push({ id, workspace_id: ws, project_id: p?.id ?? null, goal_id: o.goal ?? null, title, description: o.desc ?? '', due_date: o.due === undefined ? (o.done != null ? day(o.done + Math.round(rnd() * 4)) : null) : o.due === null ? null : day(o.due),
      status: o.done != null ? 'done' : o.status ?? 'todo', completed_at: doneDay, hours: o.hours ?? (o.done != null ? pick([0.5, 1, 1.5, 2, 3, 4, 6]) : null),
      assignee_member_id: o.who ?? (p ? pick(p.people) : sam), created_by_member: sam, source_note_id: null, source_line: null, created_at: stamp((o.done ?? o.due ?? 0) - 20) });
    if (o.prio) t.task_values.push({ task_id: id, field_id: prio.id, option_id: prio.o[o.prio], value: null });
    (o.subs ?? []).forEach(([s, d], i) => t.subtasks.push({ id: uid(), task_id: id, title: s, done: d, position: i }));
    return id;
  };
  /** n finished tasks between two days ago-offsets, with titles from a list. */
  const history = (p: Proj, titles: string[], from: number, to: number, n: number) => {
    for (let i = 0; i < n; i++) task(p, `${pick(titles)}${rnd() < 0.3 ? ` (${pick(['part 2', 'follow-up', 'v2', 'review'])})` : ''}`, { done: Math.round(from + (to - from) * (i + rnd()) / n) });
  };

  history(neag, ['Fracture logs QC', 'Formation tops picking', 'Core description', 'Well correlation', 'Weekly call with Cairo University', 'DFN parameters', 'Image log interpretation'], -145, -3, 26);
  task(neag, 'DFN model v1', { due: 6, prio: 'High', subs: [['Fracture sets', true], ['Intensity logs', false], ['Upscaling', false]] });
  task(neag, 'Static model', { due: 25, status: 'doing' });
  task(neag, 'Send fracture logs to Karim', { due: -3, who: omar });
  task(neag, 'Final report', { due: 58, who: sam });
  task(neag, 'Client workshop in Cairo', { due: 40, who: karim });

  history(cardon, ['Structural model update', 'Fault seal analysis', 'Property modelling', 'History match check', 'Report chapter'], -225, -14, 22);
  history(genel, ['Interim volumetrics', 'Seismic interpretation', 'Uncertainty runs', 'Interim report'], -320, -80, 14);
  history(igme, ['Basin model', 'Burial history', 'Source rock maps', 'Final presentation'], -385, -176, 10);
  history(support, ['Answer tNavigator ticket', 'Licence question', 'Remote session', 'Monthly call', 'Bug report to developers'], -395, -1, 34);
  task(support, 'Answer tNavigator ticket from Repsol', { due: 1, who: omar });
  task(support, 'Monthly call', { due: 11, who: lucia });
  task(support, 'Update FAQ page', { due: -6, who: elena });
  history(tnav, ['Python script for well tops', 'Workflow template', 'Training video', 'Macro clean-up', 'Documentation page'], -295, -2, 24);
  task(tnav, 'Workflow for DFN upscaling', { due: 14, who: sam, prio: 'Medium' });
  task(tnav, 'Tutorial: page layout', { due: 30, who: elena });
  task(tnav, 'Benchmark new release', { due: -2, who: omar });
  history(enagas, ['Training session', 'Exercise data set', 'Course notes', 'Feedback survey'], -38, -1, 7);
  task(enagas, 'Training day 3', { due: 4, who: sam });
  task(enagas, 'Translate course notes', { due: 9, who: lucia, subs: [['Chapter 1', true], ['Chapter 2', true], ['Chapter 3', false]] });
  task(enagas, 'Certificates', { due: 48, who: lucia });
  task(eage, 'Submit abstract', { due: 45, who: sam, prio: 'High' });
  task(eage, 'Poster', { due: 200, who: elena });
  task(eage, 'Book travel', { due: 160, who: sam });
  history(nafbd, ['Meeting with Mauritania Corporation', 'Proposal draft', 'Follow-up email', 'Visit to Alexandria', 'Market notes'], -195, -4, 15);
  task(nafbd, 'Meeting in Alexandria', { due: 3, who: karim, prio: 'High' });
  task(nafbd, 'Proposal for ONHYM', { due: 18, who: karim });
  task(nafbd, 'Price list 2027', { due: -5, who: lucia });

  // ---- goals
  const goal = (title: string, o: { start: number; end: number | null; status: string; owner: string; parent?: string; projects?: Proj[]; manual?: number; notes?: string }) => {
    const id = uid();
    t.goals.push({ id, workspace_id: ws, parent_id: o.parent ?? null, title, start_date: day(o.start), end_date: o.end == null ? null : day(o.end), status: o.status,
      manual_progress: o.manual ?? 0, notes: o.notes ?? '', owner_member_id: o.owner, created_at: stamp(o.start) });
    (o.projects ?? []).forEach(p => t.goal_projects.push({ goal_id: id, project_id: p.id }));
    return id;
  };
  const gNaf = goal('Grow our presence in North Africa', { start: -200, end: 250, status: 'on_track', owner: karim, projects: [neag, nafbd] });
  goal('Present at EAGE Morocco', { start: -20, end: 230, status: 'on_track', owner: sam, parent: gNaf, projects: [eage] });
  goal('Sign two new North African clients', { start: -200, end: 250, status: 'at_risk', owner: karim, parent: gNaf, manual: 35 });
  goal('Make tNavigator workflows easier for European clients', { start: -300, end: null, status: 'at_risk', owner: sam, projects: [tnav, enagas, support],
    notes: 'Ongoing: fewer support tickets and more self-service material.' });
  goal('Deliver every consulting study on time', { start: -400, end: 60, status: 'on_track', owner: lucia, projects: [igme, genel, cardon, neag] });
  const gDirect = goal('Write two technical papers', { start: -120, end: 150, status: 'on_track', owner: sam });
  task(null, 'Paper outline: DFN calibration', { done: -60, goal: gDirect, who: sam });
  task(null, 'Draft figures', { done: -20, goal: gDirect, who: sam });
  task(null, 'First full draft', { due: 21, goal: gDirect, who: sam });

  // ---- notebook
  const note = (p: Proj, off: number, kind: string, body: string) => t.notes.push({ id: uid(), workspace_id: ws, project_id: p.id, entry_date: day(off), kind, body, created_by_member: sam, created_at: stamp(off) });
  note(neag, -2, 'meeting', 'Call with Cairo University\nSend fracture logs to Karim\nAgree on formation tops by Friday');
  note(neag, -9, 'decision', 'Use DFN v2 parameters for the base case');
  note(neag, -30, 'note', 'Core photos uploaded to the shared drive');
  note(enagas, -5, 'meeting', 'Day 2 went well; more exercises on well correlation next time');
  note(tnav, -14, 'decision', 'Publish workflow templates monthly');
  // ---- comments, a few of them for Sam (mentions, and one on his own task)
  t.comments = [];
  const tid = (title: string) => String(t.tasks.find(x => x.title === title)!.id);
  const nid = (start: string) => String(t.notes.find(x => String(x.body).startsWith(start))!.id);
  const cm = (target: { task_id?: string; note_id?: string }, who: string, hoursAgo: number, body: string, mentions: string[] = []) =>
    t.comments.push({ id: uid(), workspace_id: ws, task_id: target.task_id ?? null, note_id: target.note_id ?? null, author_member_id: who, body, mentions,
      created_at: new Date(Date.now() - hoursAgo * 3600e3).toISOString(), edited_at: null });
  cm({ task_id: tid('DFN model v1') }, omar, 30, 'Fracture sets are in. The intensity logs need the new formation tops first.');
  cm({ task_id: tid('DFN model v1') }, elena, 5, '@Sam Rivas can we use the v2 parameters for the base case? See the decision in the notebook.', [sam]);
  cm({ task_id: tid('Send fracture logs to Karim') }, karim, 20, 'Any news on these? The client asked again this morning.');
  cm({ task_id: tid('Training day 3') }, lucia, 8, 'Room 2.14 is booked, projector included.');
  cm({ note_id: nid('Call with Cairo') }, karim, 26, 'They also want a short summary in Arabic for their board. @Lucía Navarro can we budget it?', [lucia]);
  cm({ note_id: nid('Call with Cairo') }, lucia, 3, 'Yes, I will add it to the offer. @Sam Rivas please confirm the date for the tops.', [sam]);
  cm({ task_id: tid('Proposal for ONHYM') }, lucia, 50, 'Draft looks good; two remarks on pricing.');
  void tTrain; void julia;
  return t;
}
