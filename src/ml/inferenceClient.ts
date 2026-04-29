import * as Comlink from 'comlink';
import type { InferenceWorkerApi } from '@/workers/inference.worker';

let worker: Worker | null = null;
let workerApi: Comlink.Remote<InferenceWorkerApi> | null = null;

/**
 * Returns a shared inference worker. Multiple pipelines (face detect, pose
 * estimation, upscale, ...) reuse the same Worker instance, so ONNX sessions
 * share a single WebGPU device and don't compete for VRAM.
 */
export function getInferenceWorker(): Comlink.Remote<InferenceWorkerApi> {
  if (!worker) {
    worker = new Worker(new URL('../workers/inference.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerApi = Comlink.wrap<InferenceWorkerApi>(worker);
  }
  return workerApi!;
}

/** Tear down the shared inference worker. Useful for benchmarks that need
 *  a clean ORT/WebGPU state between models — multiple WebGPU sessions in
 *  one worker share global device state and can interfere with each other. */
export async function terminateInferenceWorker(): Promise<void> {
  if (workerApi) {
    try {
      await workerApi.destroy();
    } catch {
      // ignore — worker may have already crashed
    }
    workerApi = null;
  }
  if (worker) {
    worker.terminate();
    worker = null;
  }
}
