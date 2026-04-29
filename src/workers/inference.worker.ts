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
  // Silence ORT's per-call warnings — they're often harmless (dynamic
  // output shapes, op-to-EP fallbacks) but spam a stacktrace per tile.
  ort.env.logLevel = 'error';
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
  initSession(
    modelBuffer: ArrayBuffer,
    modelUrl: string,
    backend: BackendType,
    preferNchw?: boolean
  ): Promise<BackendType>;
  run(inputTensor: Float32Array, inputShape: number[], modelUrl: string): Promise<Float32Array>;
  runMulti(
    inputTensor: Float32Array,
    inputShape: number[],
    modelUrl: string,
    /** Extra named inputs (for models with multiple inputs like baked-in NMS thresholds). */
    extraInputs?: Record<
      string,
      { data: Float32Array | Int32Array | BigInt64Array; dims: number[] }
    >
  ): Promise<Record<string, { data: Float32Array; dims: number[] }>>;
  destroy(): Promise<void>;
}

const api: InferenceWorkerApi = {
  async initSession(modelBuffer, modelUrl, backend, preferNchw) {
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
    const webgpuEp = preferNchw
      ? { name: 'webgpu' as const, preferredLayout: 'NCHW' as const }
      : ('webgpu' as const);
    const session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: effectiveBackend === 'webgpu' ? [webgpuEp, 'wasm'] : ['wasm'],
      graphOptimizationLevel: preferNchw ? 'basic' : 'all',
    });
    console.log('[ORT] Session created');

    sessions.set(modelUrl, session);
    console.log(`[ORT] Inputs: ${session.inputNames.join(', ')}`);
    console.log(`[ORT] Outputs: ${session.outputNames.join(', ')}`);
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

  async runMulti(inputTensor, inputShape, modelUrl, extraInputs) {
    const session = sessions.get(modelUrl);
    if (!session) throw new Error(`Session not initialized for ${modelUrl}`);

    return serializeRun(async () => {
      const inputName = session.inputNames[0];

      const feeds: Record<string, ort.Tensor> = {
        [inputName]: new ort.Tensor('float32', inputTensor, inputShape),
      };
      if (extraInputs) {
        for (const [name, { data, dims }] of Object.entries(extraInputs)) {
          if (data instanceof Float32Array) {
            feeds[name] = new ort.Tensor('float32', data, dims);
          } else if (data instanceof Int32Array) {
            feeds[name] = new ort.Tensor('int32', data, dims);
          } else {
            feeds[name] = new ort.Tensor('int64', data, dims);
          }
        }
      }

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
