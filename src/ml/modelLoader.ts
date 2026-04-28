export type ProgressCallback = (loaded: number, total: number) => void;

const MODEL_CACHE_NAME = 'photorestore-models-v1';

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

export async function loadModel(
  url: string,
  opts: {
    expectedSha256?: string;
    onProgress?: ProgressCallback;
  } = {}
): Promise<ArrayBuffer> {
  const { expectedSha256, onProgress } = opts;
  const resolvedUrl = resolveUrl(url);

  const cache = await caches.open(MODEL_CACHE_NAME);
  const cached = await cache.match(resolvedUrl);
  if (cached) {
    const buffer = await cached.arrayBuffer();
    return buffer;
  }

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

  const totalBytes = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const buffer = new ArrayBuffer(totalBytes);
  const view = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    view.set(chunk, offset);
    offset += chunk.byteLength;
  }

  if (expectedSha256 && expectedSha256.length > 0) {
    const actual = await sha256Hex(buffer);
    if (actual !== expectedSha256) {
      throw new Error(
        `SHA-256 mismatch for model ${url}. Expected: ${expectedSha256}, got: ${actual}`
      );
    }
  }

  const responseToCache = new Response(buffer, {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  await cache.put(resolvedUrl, responseToCache);

  return buffer;
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
