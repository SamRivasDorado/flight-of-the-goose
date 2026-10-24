import { db } from './supabase';

/** Picture types people can pick; every one is converted to WebP before upload. */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp,image/avif,image/x-icon,.ico';

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This picture could not be read. Try a PNG or JPG.')); };
    img.src = url;
  });
}

/** Shrinks a picture so its longest side is at most `max` px, keeping the whole image and any transparency. */
export async function toWebp(file: File, max = 256): Promise<Blob> {
  if (file.size > 15 * 1024 * 1024) throw new Error('This picture is too large (over 15 MB).');
  const img = await loadImage(file);
  const w0 = img.naturalWidth || max, h0 = img.naturalHeight || max; // SVGs without a size
  const k = Math.min(1, max / Math.max(w0, h0)), w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(img, 0, 0, w, h);
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/webp', 0.9));
  if (!blob) throw new Error('This picture could not be converted.');
  return blob;
}

/** Public address of a stored project or team image. */
export const imageUrl = (path: string | null | undefined) => (path ? db().storage.from('images').getPublicUrl(path).data.publicUrl : null);

/** Uploads a prepared image for a project or team and returns its storage path. */
export async function uploadImage(workspaceId: string, kind: 'projects' | 'teams', id: string, blob: Blob): Promise<string> {
  const path = `${workspaceId}/${kind}/${id}/${Date.now()}.webp`;
  // sent as plain bytes, the same way as profile pictures
  const { error } = await db().storage.from('images').upload(path, await blob.arrayBuffer(), { contentType: 'image/webp', upsert: false });
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new Error('Images need a one-time database update first (see the instructions from Claude).');
    throw new Error(`The image could not be uploaded: ${error.message}`);
  }
  return path;
}

/** Removes an old image file; failures are ignored (the file is only clutter). */
export async function removeImage(path: string | null | undefined) {
  if (path) await db().storage.from('images').remove([path]).catch(() => undefined);
}
