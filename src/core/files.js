/**
 * Photos and scans, made ready to be read by the server (`/v1/read`).
 *
 * A photo from a phone is several megabytes and far larger than the model
 * needs: it is scaled down here, in the browser, to at most 1568 pixels on its
 * long side and re-encoded as JPEG, which also drops the camera's metadata
 * (position, device). A PDF goes as it is.
 */
const MAX_EDGE = 1568;
const JPEG_QUALITY = 0.82;
const IMAGE = /^image\/(jpeg|png|webp|heic|heif|bmp|gif)$/i;

export const isPdf = (file) => file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '');
export const isImage = (file) => IMAGE.test(file?.type || '') || /\.(jpe?g|png|webp|heic|heif|bmp)$/i.test(file?.name || '');

/** base64 of bytes, in chunks: a single String.fromCharCode call overflows on large files. */
export function toBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The size an image is scaled to: never enlarged, long side at most `max`. */
export function fitWithin(width, height, max = MAX_EDGE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** One image as a JPEG the server accepts: `{ type, data }`. */
async function imageToJpeg(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    // A transparent PNG would turn black as a JPEG: white paper behind it.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
    return { type: 'image/jpeg', data: toBase64(await blob.arrayBuffer()) };
  } finally {
    bitmap.close?.();
  }
}

/**
 * Turns the chosen files into what `/v1/read` takes.
 * Images become JPEGs, in the order given (the pages of one document); a PDF
 * is sent as it is. Throws an Error with `code: 'file_type'` for anything else.
 */
export async function prepareFiles(files) {
  const out = [];
  for (const file of files) {
    if (isPdf(file)) out.push({ type: 'application/pdf', data: toBase64(await file.arrayBuffer()) });
    else if (isImage(file)) {
      try {
        out.push(await imageToJpeg(file));
      } catch {
        // A format the browser cannot decode (HEIC outside Safari, a broken file).
        throw Object.assign(new Error('unsupported image'), { code: 'file_type' });
      }
    } else throw Object.assign(new Error('unsupported file'), { code: 'file_type' });
  }
  return out;
}
