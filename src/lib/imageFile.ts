import { isHeicFile, heicToJpeg } from '@/lib/heic';

export const MAX_IMAGE_SIZE = 32 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const PHOTO_ACCEPT_ATTR = [
  ...ACCEPTED_IMAGE_TYPES,
  'image/heic',
  'image/heif',
  '.heic',
  '.heif',
].join(',');

export type ReadImageResult =
  | { ok: true; file: File }
  | { ok: false; messageKey: 'errors.fileTooLarge' | 'errors.unsupportedFormat' | 'errors.heicConversionFailed'; description?: string };

/** Validate size, transcode HEIC→JPEG if needed, and verify the final MIME
 * type. Returns either the ready-to-use File or a toast-friendly error
 * descriptor (so callers stay UI-agnostic). */
export async function readImageFile(input: File): Promise<ReadImageResult> {
  if (input.size > MAX_IMAGE_SIZE) {
    return { ok: false, messageKey: 'errors.fileTooLarge' };
  }

  let file = input;
  if (isHeicFile(file)) {
    try {
      file = await heicToJpeg(file);
    } catch (err) {
      return {
        ok: false,
        messageKey: 'errors.heicConversionFailed',
        description: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, messageKey: 'errors.unsupportedFormat' };
  }

  return { ok: true, file };
}
