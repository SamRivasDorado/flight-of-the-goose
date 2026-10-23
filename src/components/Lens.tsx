import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorkspace } from '../auth/session';
import { useLens } from '../lib/lens';
import { canManage, type Dim } from '../lib/types';
import { Icon } from './Logo';
import { DimensionsDialog } from './DimensionsDialog';

/** A coloured label for a dimension value. Dashed when the task inherits it from its project. */
export function OptPill({ dim, option, inherited }: { dim: Dim | undefined; option: string | null; inherited?: boolean }) {
  const o = dim?.options.find(x => x.id === option);
  if (!o) return null;
  return <span className={`pill ${inherited ? 'inh' : ''}`} style={{ ['--c' as string]: o.color }} title={inherited ? `${dim!.name}: from the project` : dim!.name}>{o.label}</span>;
}

/** The Lens bar under the top bar: filters every screen at once. */
export function LensBar({ page, self }: { page: string; self: boolean }) {
  const ws = useWorkspace();
  const lens = useLens();
  const [dimsOpen, setDimsOpen] = useState(false);
  if (page === 'strategy' || page === 'team') return null;
  const sel = (key: string, label: string, opts: [string, string][]) => {
    const v = lens.filt[key] ?? '';
    return (
      <select key={key} className={`fsel ${v ? 'on' : ''}`} aria-label={`Filter by ${label}`} value={v} onChange={e => lens.setFilt(key, e.target.value)}>
        <option value="">{label}: any</option>
        {opts.map(([id, l]) => <option key={id} value={id}>{label}: {l}</option>)}</select>);
  };
  const lockedSelf = self && (page === 'review' || page === 'insights');
  return (
    <div className="fbar gut">
      <span className="lab" title="The lens filters every screen at once"><Icon name="filter" />Lens</span>
      {lockedSelf
        ? <span className="fsel on" title="Members see their own work in Review and Insights. Managers and admins can see anyone's.">Person: me</span>
        : sel('person', 'Person', lens.members.map(m => [m.id, m.id === ws.member_id ? `${m.display_name} (me)` : m.display_name]))}
      {lens.teams.length > 0 && sel('team', 'Team', lens.teams.map(t => [t.id, t.name]))}
      {page !== 'project' && sel('project', 'Project', [...lens.projects.map(p => [p.id, p.name] as [string, string]), ['none', 'No project']])}
      {lens.dims.map(d => sel(d.id, d.name, d.options.map(o => [o.id, o.label])))}
      {lens.any && <button className="btn sm ghost" onClick={lens.clear}><Icon name="x" />Clear</button>}
      <span style={{ flex: 1 }} />
      {canManage(ws.access) && <button className="btn sm ghost" onClick={() => setDimsOpen(true)}><Icon name="gear" />Dimensions</button>}
      {dimsOpen && createPortal(<DimensionsDialog onClose={() => setDimsOpen(false)} />, document.body)}
    </div>);
}
