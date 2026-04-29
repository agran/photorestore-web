// HEIC / HEIF detection and conversion. Browsers do not natively decode
// HEIC, so iPhone / Android uploads that bypass the OS-level conversion
// (e.g. file picker on Android, "Original" share on iOS) need an in-browser
// transcode to JPEG before they can be loaded into <img> / <canvas>.
//
// Uses heic-to (libheif-js v1.18+), which handles 10-bit HDR HEIC and the
// Main Still Picture profile produced by iPhone 12+ — heic2any on its older
// libheif build silently fails on those files.

const HEIC_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

const HEIC_EXTENSIONS = /\.(heic|heif)$/i;

export function isHeicFile(file: File): boolean {
  // Android often reports an empty MIME type for HEIC — fall back to extension.
  if (file.type && HEIC_MIME_TYPES.has(file.type.toLowerCase())) return true;
  return HEIC_EXTENSIONS.test(file.name);
}

export async function heicToJpeg(file: File, quality = 0.92): Promise<File> {
  const { heicTo } = await import('heic-to');
  const blob = await heicTo({ blob: file, type: 'image/jpeg', quality });
  const baseName = file.name.replace(HEIC_EXTENSIONS, '') || 'image';
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });
}
