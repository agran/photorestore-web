export type ProgressCallback = (loaded: number, total: number) => void;

const MODEL_CACHE_NAME = 'photorestore-models-v1';
const inFlight = new Map<string, Promise<ArrayBuffer>>();

function resolveUrl(rawUrl: string): string {
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    return rawUrl;
  }
  return import.meta.env.BASE_URL + rawUrl;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function fetchAndCache(
  resolvedUrl: string,
  opts: {
    expectedSha256?: string;
    onProgress?: ProgressCallback;
  }
): Promise<ArrayBuffer> {
  const { expectedSha256, onProgress } = opts;

  const response = await fetch(resolvedUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch model: ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get('Content-Length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('ReadableStream not supported');
  }

  // When Content-Length is known we can stream chunks straight into a single
  // pre-allocated ArrayBuffer — avoids the doubled peak memory ("chunks
  // array" + "concatenated buffer") that hurts on 350 MB models.
  let buffer: ArrayBuffer;
  let view: Uint8Array;
  let loaded = 0;

  if (total > 0) {
    buffer = new ArrayBuffer(total);
    view = new Uint8Array(buffer);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      // Defensive: trust total but stop overflowing the buffer if the server
      // streamed more bytes than Content-Length advertised.
      const writable = Math.min(value.byteLength, total - loaded);
      if (writable > 0) {
        view.set(value.subarray(0, writable), loaded);
        loaded += writable;
      }
      onProgress?.(loaded, total);
    }
  } else {
    // Unknown size — fall back to chunk array + concat. Doubles peak memory
    // but only for the duration of this branch.
    const chunks: Uint8Array[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        onProgress?.(loaded, 0);
      }
    }
    buffer = new ArrayBuffer(loaded);
    view = new Uint8Array(buffer);
    let offset = 0;
    for (const chunk of chunks) {
      view.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }

  if (expectedSha256 && expectedSha256.length > 0) {
    const actual = await sha256Hex(buffer);
    if (actual !== expectedSha256) {
      throw new Error(
        `SHA-256 mismatch for model ${resolvedUrl}. Expected: ${expectedSha256}, got: ${actual}`
      );
    }
  }

  const cache = await caches.open(MODEL_CACHE_NAME);
  const responseToCache = new Response(buffer, {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  await cache.put(resolvedUrl, responseToCache);

  return buffer;
}

export async function loadModel(
  url: string,
  opts: {
    expectedSha256?: string;
    onProgress?: ProgressCallback;
  } = {}
): Promise<ArrayBuffer> {
  const { onProgress } = opts;
  const resolvedUrl = resolveUrl(url);

  const cache = await caches.open(MODEL_CACHE_NAME);
  const cached = await cache.match(resolvedUrl);
  if (cached) {
    const buffer = await cached.arrayBuffer();
    onProgress?.(buffer.byteLength, buffer.byteLength);
    return buffer;
  }

  const existing = inFlight.get(resolvedUrl);
  if (existing) return existing;

  const promise = fetchAndCache(resolvedUrl, opts).finally(() => {
    inFlight.delete(resolvedUrl);
  });
  inFlight.set(resolvedUrl, promise);
  return promise;
}

/** Check whether a model is already cached */
export async function isModelCached(url: string): Promise<boolean> {
  const resolvedUrl = resolveUrl(url);
  const cache = await caches.open(MODEL_CACHE_NAME);
  const cached = await cache.match(resolvedUrl);
  return cached !== null && cached !== undefined;
}

/** Evict a specific model from cache */
export async function evictModel(url: string): Promise<boolean> {
  const resolvedUrl = resolveUrl(url);
  const cache = await caches.open(MODEL_CACHE_NAME);
  return cache.delete(resolvedUrl);
}
