import * as Comlink from 'comlink';

/**
 * Inference worker — runs ONNX model inference off the main thread.
 * TODO: implement actual inference pipelines.
 */

export interface InferenceWorkerApi {
  /** Initialize the ORT session for a given model */
  initSession(modelUrl: string, backend: 'webgpu' | 'wasm'): Promise<void>;
  /** Run inference on raw image data */
  runInference(inputData: Float32Array, width: number, height: number): Promise<Float32Array>;
  /** Terminate and release session */
  destroy(): Promise<void>;
}

const api: InferenceWorkerApi = {
  async initSession(_modelUrl: string, _backend: 'webgpu' | 'wasm'): Promise<void> {
    // TODO: create ORT InferenceSession via runtime.ts createSession
  },

  async runInference(
    _inputData: Float32Array,
    _width: number,
    _height: number
  ): Promise<Float32Array> {
    // TODO: run session.run() and return output tensor data
    await Promise.resolve(); // placeholder
    return new Float32Array(0);
  },

  async destroy(): Promise<void> {
    // TODO: session.release()
  },
};

Comlink.expose(api);
