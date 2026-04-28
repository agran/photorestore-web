/**
 * Face detection stub.
 * TODO: implement using a face detection ONNX model (e.g. RetinaFace).
 */

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export async function detectFaces(_canvas: HTMLCanvasElement): Promise<FaceBox[]> {
  // TODO: implement face detection pipeline
  await Promise.resolve(); // placeholder
  return [];
}
