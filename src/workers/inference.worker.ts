import * as ort from 'onnxruntime-web';
import * as Comlink from 'comlink';

self.onerror = (e) => console.error('[ORT Worker]', e);
self.onunhandledrejection = (e) => console.error('[ORT Worker] Unhandled:', e.reason);

type BackendType = 'webgpu' | 'wasm';

const sessions = new Map<string, ort.InferenceSession>();

// ORT WebGPU EP shares a global device across sessions and is not safe to
// re-enter. If two pipelines (face detect + pose estimate) await runs in
// parallel from the same worker, ORT can throw "Session mismatch". Serialize
// inferenceSession.run() calls through a single FIFO queue.
let runQueue: Promise<unknown> = Promise.resolve();
function serializeRun<T>(fn: () => Promise<T>): Promise<T> {
  const next = runQueue.then(fn, fn);
  runQueue = next.catch(() => {});
  return next;
}

function setupRuntime(numThreads: number, enableSIMD: boolean) {
  ort.env.wasm.numThreads = numThreads;
  ort.env.wasm.simd = enableSIMD;
}

async function detectBackend(): Promise<BackendType> {
  const gpu = (
    self as unknown as { navigator?: { gpu?: { requestAdapter(): Promise<unknown> } } }
  ).navigator?.gpu;
  if (!gpu) return 'wasm';

  try {
    const adapter = await Promise.race([
      gpu.requestAdapter(),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('WebGPU adapter timeout')), 3000)
      ),
    ]);
    if (adapter) return 'webgpu';
  } catch {
    // timeout or error — fall back to WASM
  }
  return 'wasm';
}

export interface InferenceWorkerApi {
  initSession(modelBuffer: ArrayBuffer, modelUrl: string, backend: BackendType): Promise<BackendType>;
  run(inputTensor: Float32Array, inputShape: number[], modelUrl: string): Promise<Float32Array>;
  runMulti(
    inputTensor: Float32Array,
    inputShape: number[],
    modelUrl: string
  ): Promise<Record<string, { data: Float32Array; dims: number[] }>>;
  destroy(): Promise<void>;
}

const api: InferenceWorkerApi = {
  async initSession(modelBuffer, modelUrl, backend) {
    if (sessions.has(modelUrl)) return backend;

    console.log('[ORT] Detecting backend...');
    const detectedBackend = await detectBackend();
    console.log(`[ORT] Detected: ${detectedBackend}`);
    const effectiveBackend =
      backend === 'webgpu' && detectedBackend === 'webgpu' ? 'webgpu' : 'wasm';

    console.log(
      `[ORT] Backend: ${effectiveBackend.toUpperCase()}${effectiveBackend === 'webgpu' ? ' (GPU)' : ' (CPU)'}`
    );

    setupRuntime(4, true);
    console.log('[ORT] Creating InferenceSession...');
    const session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: effectiveBackend === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'],
      graphOptimizationLevel: 'all',
    });
    console.log('[ORT] Session created');

    sessions.set(modelUrl, session);
    return effectiveBackend;
  },

  async run(inputTensor, inputShape, modelUrl) {
    const session = sessions.get(modelUrl);
    if (!session) throw new Error(`Session not initialized for ${modelUrl}`);

    return serializeRun(async () => {
      const inputName = session.inputNames[0];
      const outputName = session.outputNames[0];

      const feeds: Record<string, ort.Tensor> = {
        [inputName]: new ort.Tensor('float32', inputTensor, inputShape),
      };

      const results = await session.run(feeds);
      const output = results[outputName];

      return new Float32Array(output.data as Float32Array);
    });
  },

  async runMulti(inputTensor, inputShape, modelUrl) {
    const session = sessions.get(modelUrl);
    if (!session) throw new Error(`Session not initialized for ${modelUrl}`);

    return serializeRun(async () => {
      const inputName = session.inputNames[0];

      const feeds: Record<string, ort.Tensor> = {
        [inputName]: new ort.Tensor('float32', inputTensor, inputShape),
      };

      const results = await session.run(feeds);

      const record: Record<string, { data: Float32Array; dims: number[] }> = {};
      for (const name of session.outputNames) {
        const output = results[name];
        record[name] = {
          data: new Float32Array(output.data as Float32Array),
          dims: output.dims.slice(),
        };
      }
      return record;
    });
  },

  async destroy() {
    const releases = Array.from(sessions.values()).map((s) => s.release());
    await Promise.all(releases);
    sessions.clear();
  },
};

Comlink.expose(api);
