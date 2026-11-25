/**
 * Click-through from a chart in Insights to the Tasks page: the exact tasks behind one slice or bar
 * (so the list always matches the chart). Handed over in memory: it is temporary and not saved anywhere.
 */
export interface Drill {
  ids: string[];
  /** "Hours logged by goal · PGM · Penetrate in the geothermal market" */
  title: string;
  /** "All projects · This month (1 – 30 Nov 2026)" */
  sub: string;
  /** "4 tasks, 6 h" */
  total: string;
}

let pending: Drill | null = null;

/** Insights: remember the tasks behind a slice, then go to Tasks. */
export function openDrill(d: Drill) {
  pending = d;
  window.location.hash = '#/tasks';
}
/** Tasks: what Insights handed over (read on the first render)… */
export const peekDrill = () => pending;
/** …and forget it once it has been taken, so a later visit to Tasks shows all tasks again. */
export const forgetDrill = () => { pending = null; };
