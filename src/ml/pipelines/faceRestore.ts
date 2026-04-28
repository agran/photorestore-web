/**
 * Face restoration pipeline stub.
 * TODO: implement using GFPGAN / CodeFormer ONNX models.
 */

export interface FaceRestoreOptions {
  modelId?: 'gfpgan-v1.4' | 'codeformer';
  /** CodeFormer fidelity weight (0 = quality, 1 = fidelity) */
  fidelity?: number;
}

export interface FaceRestoreResult {
  canvas: HTMLCanvasElement;
  facesRestored: number;
  elapsedMs: number;
}

/**
 * Restore faces in an image.
 *
 * @param canvas  - Input image canvas
 * @param options - Face restore options
 * @returns Promise resolving to the restored canvas
 */
export async function faceRestore(
  canvas: HTMLCanvasElement,
  _options: FaceRestoreOptions = {}
): Promise<FaceRestoreResult> {
  // TODO: detect faces, crop/align, run model, paste back
  const start = performance.now();
  await Promise.resolve(); // placeholder

  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  output.getContext('2d')?.drawImage(canvas, 0, 0);

  return {
    canvas: output,
    facesRestored: 0,
    elapsedMs: performance.now() - start,
  };
}
