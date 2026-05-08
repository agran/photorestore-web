import * as Comlink from 'comlink';
import type { InferenceWorkerApi } from '@/workers/inference.worker';

let worker: Worker | null = null;
let workerApi: Comlink.Remote<InferenceWorkerApi> | null = null;

function spawnWorker(): { worker: Worker; api: Comlink.Remote<InferenceWorkerApi> } {
  const w = new Worker(new URL('../workers/inference.worker.ts', import.meta.url), {
    type: 'module',
  });
  // Crash recovery: if the worker dies (uncaught exception, OOM, killed by
  // the browser), drop our cached refs so the next call spawns a fresh one.
  // Without this, callers would await forever on a Comlink proxy backed by
  // a dead Worker.
  w.addEventListener('error', (event) => {
    console.error('[inferenceClient] worker error, will respawn:', event.message);
    if (worker === w) {
      worker = null;
      workerApi = null;
    }
  });
  w.addEventListener('messageerror', (event) => {
    console.error('[inferenceClient] worker messageerror:', event);
    if (worker === w) {
      worker = null;
      workerApi = null;
    }
  });
  return { worker: w, api: Comlink.wrap<InferenceWorkerApi>(w) };
}

/**
 * Returns a shared inference worker. Multiple pipelines (face detect, pose
 * estimation, upscale, ...) reuse the same Worker instance, so ONNX sessions
 * share a single WebGPU device and don't compete for VRAM.
 *
 * Auto-respawns if the previous worker crashed — but ONNX sessions don't
 * survive the crash, so callers will need to re-init their model on next use.
 */
export function getInferenceWorker(): Comlink.Remote<InferenceWorkerApi> {
  if (!worker || !workerApi) {
    const spawned = spawnWorker();
    worker = spawned.worker;
    workerApi = spawned.api;
  }
  return workerApi;
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
