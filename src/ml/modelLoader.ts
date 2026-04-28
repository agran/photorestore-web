export type ProgressCallback = (loaded: number, total: number) => void;

const MODEL_CACHE_NAME = 'photorestore-models-v1';

/**
 * Compute SHA-256 hash of an ArrayBuffer and return hex string.
 */
async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Load a model ONNX file, using Cache API for persistence.
 * Reports progress through `onProgress` callback.
 * Optionally verifies the sha256 checksum after download.
 */
export async function loadModel(
  url: string,
  opts: {
    expectedSha256?: string;
    onProgress?: ProgressCallback;
  } = {}
): Promise<ArrayBuffer> {
  const { expectedSha256, onProgress } = opts;

  // Try cache first
  const cache = await caches.open(MODEL_CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) {
    const buffer = await cached.arrayBuffer();
    return buffer;
  }

  // Download with progress
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch model: ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get('Content-Length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('ReadableStream not supported');
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.(loaded, total);
    }
  }

  // Combine chunks
  const totalBytes = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const buffer = new ArrayBuffer(totalBytes);
  const view = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    view.set(chunk, offset);
    offset += chunk.byteLength;
  }

  // Verify SHA-256 if provided
  if (expectedSha256 && expectedSha256.length > 0) {
    const actual = await sha256Hex(buffer);
    if (actual !== expectedSha256) {
      throw new Error(
        `SHA-256 mismatch for model ${url}. Expected: ${expectedSha256}, got: ${actual}`
      );
    }
  }

  // Store in cache
  const responseToCache = new Response(buffer, {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  await cache.put(url, responseToCache);

  return buffer;
}

/** Check whether a model is already cached */
export async function isModelCached(url: string): Promise<boolean> {
  const cache = await caches.open(MODEL_CACHE_NAME);
  const cached = await cache.match(url);
  return cached !== null && cached !== undefined;
}

/** Evict a specific model from cache */
export async function evictModel(url: string): Promise<boolean> {
  const cache = await caches.open(MODEL_CACHE_NAME);
  return cache.delete(url);
}
