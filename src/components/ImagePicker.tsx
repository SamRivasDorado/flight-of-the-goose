import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IMAGE_ACCEPT, toWebp } from '../lib/images';
import { Icon } from './Logo';

/** A picked image, prepared but not uploaded yet (uploads happen on Create / Save). */
export interface PickedImage { blob: Blob | null; preview: string | null; cleared: boolean }
export const NO_PICK: PickedImage = { blob: null, preview: null, cleared: false };

/** "Use your own image" button with a preview slot; the dialog decides when to upload. */
export function ImagePicker({ hasImage, preview, onPick, onClear, onError, extra, hint }: {
  hasImage: boolean; preview: ReactNode; onPick: (img: PickedImage) => void; onClear: () => void;
  onError: (msg: string | null) => void; extra?: ReactNode; hint: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(f: File | undefined) {
    if (!f) return;
    setBusy(true); onError(null);
    try { const blob = await toWebp(f); onPick({ blob, preview: URL.createObjectURL(blob), cleared: false }); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return (
    <div className="row" style={{ gap: 12, alignItems: 'center' }}>
      {preview}
      <label className="btn sm"><Icon name="plus" />{busy ? 'Preparing…' : hasImage ? 'Replace image' : 'Use your own image'}
        <input ref={input} type="file" accept={IMAGE_ACCEPT} hidden disabled={busy} onChange={e => void pick(e.target.files?.[0])} /></label>
      {hasImage && <button type="button" className="btn sm ghost" onClick={onClear}>Remove image</button>}
      {extra}
      <span className="hint" style={{ flexBasis: '100%' }}>{hint}</span>
    </div>);
}

/** Frees preview addresses when a dialog closes. */
export function useRevoke(img: PickedImage) {
  useEffect(() => () => { if (img.preview) URL.revokeObjectURL(img.preview); }, [img.preview]);
}
