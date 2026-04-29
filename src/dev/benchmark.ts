import { getModelsByPipeline, type ModelMeta } from '@/ml/modelRegistry';
import { upscale, terminateWorker as terminateUpscaleWorker } from '@/ml/pipelines/upscale';
import { detectFaces } from '@/ml/pipelines/anonymize';
import { anonymizeVideo } from '@/ml/pipelines/anonymizeVideo';
import { terminateInferenceWorker } from '@/ml/inferenceClient';
import { useEditorStore } from '@/store/editorStore';
import { useVideoAnonymizeStore } from '@/store/videoAnonymizeStore';

interface BenchRow {
  model: string;
  id: string;
  warmupMs: number;
  meanMs: number;
  minMs: number;
  maxMs: number;
}

interface VideoBenchRow {
  model: string;
  id: string;
  frames: number;
  wallSec: number;
  msPerFrame: number;
  fps: number;
  /** wall-time speed vs realtime — 2.0× means processing is twice as fast as playback */
  realtimeRatio: number;
}

interface BenchOptions {
  runs?: number;
}

async function loadImageToCanvas(url: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = url;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image'));
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d')!.drawImage(img, 0, 0);
  return canvas;
}

async function timeOne(fn: () => Promise<unknown>): Promise<number> {
  const t = performance.now();
  await fn();
  return performance.now() - t;
}

/** Log progress every ~step% to avoid drowning the console. */
function makeProgressLogger(prefix: string, step = 10): (p: number) => void {
  let last = -step;
  return (p) => {
    const rounded = Math.round(p);
    if (rounded - last >= step || rounded >= 99) {
      console.log(`    ${prefix} ${rounded}%`);
      last = rounded;
    }
  };
}

async function benchOneModel(
  model: ModelMeta,
  fn: () => Promise<unknown>,
  runs: number,
): Promise<BenchRow | null> {
  try {
    console.log(`  warmup...`);
    const warmupMs = await timeOne(fn);
    console.log(`  warmup done in ${Math.round(warmupMs)}ms (includes session init + shader compile)`);
    const samples: number[] = [];
    for (let i = 0; i < runs; i++) {
      console.log(`  run ${i + 1}/${runs}...`);
      const ms = await timeOne(fn);
      samples.push(ms);
      console.log(`  run ${i + 1}/${runs} done in ${Math.round(ms)}ms`);
    }
    const sum = samples.reduce((a, b) => a + b, 0);
    return {
      model: model.name,
      id: model.id,
      warmupMs: Math.round(warmupMs),
      meanMs: Math.round(sum / samples.length),
      minMs: Math.round(Math.min(...samples)),
      maxMs: Math.round(Math.max(...samples)),
    };
  } catch (err) {
    console.error(`  [${model.id}] FAILED:`, err);
    return null;
  }
}

function printMarkdown(title: string, info: string, rows: BenchRow[]) {
  const lines = [
    '',
    `### ${title} ${info}`,
    '',
    '| Model | id | Warmup ms | Mean ms | Min | Max |',
    '|-------|----|----------:|--------:|----:|----:|',
    ...rows.map(
      (r) => `| ${r.model} | \`${r.id}\` | ${r.warmupMs} | ${r.meanMs} | ${r.minMs} | ${r.maxMs} |`,
    ),
  ];
  console.log(lines.join('\n'));
}

function gpuModels(pipeline: ModelMeta['pipeline']): ModelMeta[] {
  return getModelsByPipeline(pipeline).filter((m) => !m.forceWasm);
}

async function benchUpscale(options: BenchOptions = {}): Promise<void> {
  const runs = options.runs ?? 2;
  const editor = useEditorStore.getState();
  if (!editor.currentImageUrl) {
    console.error('[bench.upscale] Open a photo first.');
    return;
  }
  const canvas = await loadImageToCanvas(editor.currentImageUrl);
  const info = `(${canvas.width}×${canvas.height}, runs=${runs} + 1 warmup, WebGPU only)`;
  const models = gpuModels('upscale');
  console.log(`\n=== Upscale ${info} — ${models.length} models ===`);
  const rows: BenchRow[] = [];
  const t0 = performance.now();
  for (let idx = 0; idx < models.length; idx++) {
    const model = models[idx];
    console.log(
      `\n[${idx + 1}/${models.length}] ${model.name} (${model.id}) — input ${model.inputShape[3]}×${model.inputShape[2]}`,
    );
    const row = await benchOneModel(
      model,
      () =>
        upscale(canvas, {
          modelId: model.id,
          onProgress: makeProgressLogger('upscale'),
        }),
      runs,
    );
    if (row) {
      console.log(`  → ${model.name}: mean ${row.meanMs}ms (warmup ${row.warmupMs}ms)`);
      rows.push(row);
    }
    // Recreate the worker between models — multiple WebGPU sessions in
    // one ORT instance share device state and can interfere with each
    // other (Transpose recursive, AveragePool kernel reuse, etc).
    terminateUpscaleWorker();
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`  [progress] ${idx + 1}/${models.length} done, total elapsed ${elapsed}s`);
  }
  console.table(rows);
  printMarkdown('Upscale ×4', info, rows);
  const totalSec = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`\n[bench.upscale] Done in ${totalSec}s. Copy the markdown block above and paste it back.`);
}

async function benchFacePhoto(canvas: HTMLCanvasElement, runs: number): Promise<void> {
  const info = `(${canvas.width}×${canvas.height}, photo, runs=${runs} + 1 warmup, WebGPU only)`;
  const models = gpuModels('anonymize');
  console.log(`\n=== Face detect ${info} — ${models.length} models ===`);
  const rows: BenchRow[] = [];
  const t0 = performance.now();
  for (let idx = 0; idx < models.length; idx++) {
    const model = models[idx];
    console.log(
      `\n[${idx + 1}/${models.length}] ${model.name} (${model.id}) — input ${model.inputShape[3]}×${model.inputShape[2]}`,
    );
    const row = await benchOneModel(
      model,
      () =>
        detectFaces(canvas, {
          modelId: model.id,
          threshold: 0.5,
          onProgress: makeProgressLogger('detect'),
        }),
      runs,
    );
    if (row) {
      console.log(`  → ${model.name}: mean ${row.meanMs}ms (warmup ${row.warmupMs}ms)`);
      rows.push(row);
    }
    // Recreate the worker between models — multiple WebGPU sessions in
    // one ORT instance share device state and can interfere with each
    // other (Transpose recursive, AveragePool kernel reuse, etc).
    await terminateInferenceWorker();
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`  [progress] ${idx + 1}/${models.length} done, total elapsed ${elapsed}s`);
  }
  console.table(rows);
  printMarkdown('Face detect (Скрыть лица)', info, rows);
  const totalSec = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`\n[bench.face] Done in ${totalSec}s. Copy the markdown block above and paste it back.`);
}

async function benchFaceVideo(): Promise<void> {
  const video = useVideoAnonymizeStore.getState();
  if (!video.file) {
    console.error('[bench.face] Video has no associated File — re-open it.');
    return;
  }
  const file = video.file;
  const totalFrames = video.frameCount;
  const videoSec = video.duration;
  const info = `(${video.width}×${video.height}, ${videoSec.toFixed(1)}s @${video.fps.toFixed(1)}fps, ${totalFrames} frames, fast+anatomy, WebGPU only)`;
  const models = gpuModels('anonymize');
  console.log(`\n=== Video face detect ${info} — ${models.length} models ===`);
  console.log('[bench.face] One full-pipeline pass per model. This will take a while.');
  const rows: VideoBenchRow[] = [];
  const t0 = performance.now();
  for (let idx = 0; idx < models.length; idx++) {
    const model = models[idx];
    console.log(
      `\n[${idx + 1}/${models.length}] ${model.name} (${model.id}) — pipeline: fast quality + bodyTracking`,
    );
    let lastProgress = 0;
    const runStart = performance.now();
    try {
      await anonymizeVideo(file, {
        modelId: model.id,
        quality: 'fast',
        bodyTracking: true,
        videoDuration: videoSec,
        videoFps: video.fps,
        effectOptions: {
          effect: 'pixelate',
          pixelateSize: 10,
          padding: 0,
          feather: 0,
          maskShape: 'ellipse',
        },
        onProgress: (p) => {
          if (p - lastProgress >= 5) {
            const elapsed = ((performance.now() - runStart) / 1000).toFixed(1);
            console.log(`    progress ${Math.round(p)}% (elapsed ${elapsed}s)`);
            lastProgress = p;
          }
        },
      });
      const wallSec = (performance.now() - runStart) / 1000;
      const msPerFrame = (wallSec * 1000) / totalFrames;
      const fps = totalFrames / wallSec;
      const realtimeRatio = videoSec / wallSec;
      const row: VideoBenchRow = {
        model: model.name,
        id: model.id,
        frames: totalFrames,
        wallSec: Math.round(wallSec * 10) / 10,
        msPerFrame: Math.round(msPerFrame),
        fps: Math.round(fps * 10) / 10,
        realtimeRatio: Math.round(realtimeRatio * 100) / 100,
      };
      console.log(
        `  → ${model.name}: ${row.msPerFrame}ms/frame, ${row.fps}fps, ${row.realtimeRatio}× realtime (${row.wallSec}s wall)`,
      );
      rows.push(row);
    } catch (err) {
      console.error(`  [${model.id}] FAILED:`, err);
    }
    // Free WebGPU state between models — see note in benchUpscale/benchFacePhoto.
    await terminateInferenceWorker();
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`  [progress] ${idx + 1}/${models.length} models done, total elapsed ${elapsed}s`);
  }
  console.table(rows);
  const lines = [
    '',
    `### Video face detect ${info}`,
    '',
    '| Model | id | frames | wall s | ms/frame | fps | realtime× |',
    '|-------|----|------:|------:|--------:|----:|---------:|',
    ...rows.map(
      (r) =>
        `| ${r.model} | \`${r.id}\` | ${r.frames} | ${r.wallSec} | ${r.msPerFrame} | ${r.fps} | ${r.realtimeRatio}× |`,
    ),
  ];
  console.log(lines.join('\n'));
  const totalSec = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`\n[bench.face] Done in ${totalSec}s. Copy the markdown block above and paste it back.`);
}

async function benchFace(options: BenchOptions = {}): Promise<void> {
  const runs = options.runs ?? 2;
  const editor = useEditorStore.getState();
  const video = useVideoAnonymizeStore.getState();

  if (video.videoUrl && video.file) {
    await benchFaceVideo();
    return;
  }

  if (editor.currentImageUrl) {
    const canvas = await loadImageToCanvas(editor.currentImageUrl);
    await benchFacePhoto(canvas, runs);
    return;
  }

  console.error('[bench.face] Open a photo or video first.');
}

interface BenchApi {
  upscale: (options?: BenchOptions) => Promise<void>;
  face: (options?: BenchOptions) => Promise<void>;
}

if (import.meta.env.DEV) {
  const api: BenchApi = { upscale: benchUpscale, face: benchFace };
  (window as unknown as { bench: BenchApi }).bench = api;
  console.log('[bench] Ready. WebGPU-only. Commands:');
  console.log('  bench.upscale()       — bench all upscale models on the loaded photo');
  console.log('  bench.face()          — bench all face-detect models on photo or video frame');
  console.log('  bench.upscale({ runs: 5 })  — more samples (default 2 + 1 warmup)');
}
