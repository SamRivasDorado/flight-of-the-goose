import { useState } from 'react';
import { Icon } from './Logo';

/** A small button that copies a picture to the clipboard (as "Copy chart as a picture" does in Insights). */
export function CopyPicture({ make, what }: { make: () => Promise<Blob>; what: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'fail'>('idle');
  async function copy() {
    if (state === 'busy') return;
    setState('busy');
    try {
      // the picture is passed as a promise so Safari keeps the click's permission to write to the clipboard
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': make() })]);
      setState('done');
    } catch { setState('fail'); }
    setTimeout(() => setState('idle'), 2500);
  }
  const tip = state === 'done' ? 'Copied: paste it into a document, slide or email' : state === 'fail' ? 'This browser did not allow copying the picture'
    : state === 'busy' ? 'Making the picture…' : `Copy ${what} as a picture`;
  return <button className={`iconbtn nosnap ${state === 'done' ? 'okc' : state === 'fail' ? 'failc' : ''}`} onClick={() => void copy()} aria-label={tip} title={tip}>
    <Icon name={state === 'done' ? 'check' : state === 'fail' ? 'x' : 'copy'} /></button>;
}
