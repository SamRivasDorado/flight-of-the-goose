import { toBlob } from 'html-to-image';

/**
 * Pictures of parts of the screen (the "Who works on what" table, a person card) for documents, slides and emails.
 * Made inside the browser: nothing is sent anywhere. Like the Insights charts, the picture is always on white in
 * the light colours of the current palette, whatever the app's theme, and shows the whole element (a wide table
 * is not cut at the edge of the screen). Elements marked .nosnap (buttons) are left out.
 */

/** The light colours of the current palette, read from the app's own style rules. */
function lightVars(): [string, string][] {
  const pal = document.documentElement.dataset.palette;
  const wanted = new Set([':root', ...(pal ? [`:root[data-palette="${pal}"]`] : [])]);
  const out = new Map<string, string>();
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }   // other sites' style sheets (the web fonts) cannot be read
    for (const r of Array.from(rules)) {
      // top-level rules only: the dark colours sit inside @media blocks or carry [data-theme="dark"]
      if (!(r instanceof CSSStyleRule) || !wanted.has(r.selectorText.trim())) continue;
      for (const prop of Array.from(r.style)) if (prop.startsWith('--')) out.set(prop, r.style.getPropertyValue(prop).trim());
    }
  }
  return [...out];
}

const longDate = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export async function snapshot(el: HTMLElement, o: { title?: string; width?: number } = {}): Promise<Blob> {
  const box = document.createElement('div');
  box.className = 'snapshot';
  for (const [k, v] of lightVars()) box.style.setProperty(k, v);
  box.style.setProperty('--surface', '#ffffff');
  const head = document.createElement('div'); head.className = 'snaphead';
  if (o.title) { const t = document.createElement('div'); t.className = 'snaptitle'; t.textContent = o.title; head.appendChild(t); }
  const d = document.createElement('div'); d.className = 'snapdate'; d.textContent = longDate(); head.appendChild(d);
  box.appendChild(head);
  const copy = el.cloneNode(true) as HTMLElement;
  if (o.width) copy.style.width = `${o.width}px`;
  box.appendChild(copy);
  // the holder keeps it off screen; the box itself has no offset, or the picture would be empty
  const holder = document.createElement('div'); holder.className = 'snapholder';
  holder.appendChild(box); document.body.appendChild(holder);
  try {
    await document.fonts?.ready;
    await Promise.all(Array.from(box.querySelectorAll('img')).map(i => i.decode().catch(() => undefined)));
    const blob = await toBlob(box, {
      pixelRatio: 2, backgroundColor: '#ffffff', width: box.scrollWidth, height: box.scrollHeight,
      filter: n => !(n instanceof HTMLElement && n.classList.contains('nosnap')),
    });
    if (!blob) throw new Error('no picture');
    return blob;
  } finally { holder.remove(); }
}
