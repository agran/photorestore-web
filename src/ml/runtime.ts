import * as ort from 'onnxruntime-web';

export type BackendType = 'webgpu' | 'wasm';

/** Detect the best available compute backend */
export async function detectBackend(): Promise<BackendType> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (gpu) {
    try {
      const adapter = await gpu.requestAdapter();
      if (adapter) return 'webgpu';
    } catch {
      // fall through
    }
  }
  return 'wasm';
}

export interface SessionOptions {
  backend?: BackendType;
  numThreads?: number;
  enableSIMD?: boolean;
}

/** Initialize ORT session for a given model URL */
export async function createSession(
  modelUrl: string,
  opts: SessionOptions = {}
): Promise<ort.InferenceSession> {
  const { backend = 'wasm', numThreads = 4, enableSIMD = true } = opts;

  ort.env.wasm.numThreads = numThreads;
  ort.env.wasm.simd = enableSIMD;

  // Point to wasm assets (will be resolved from public dir)
  ort.env.wasm.wasmPaths = '/';

  const sessionOpts: ort.InferenceSession.SessionOptions = {
    executionProviders: backend === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'],
    graphOptimizationLevel: 'all',
  };

  return ort.InferenceSession.create(modelUrl, sessionOpts);
}
