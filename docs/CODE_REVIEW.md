# PhotoRestore Web Code Review

> 🇷🇺 [Русская версия](./CODE_REVIEW.ru.md)

This document is not a bug log — it's a digest of lessons drawn from four code-review passes (Kimi Code CLI + Claude). All issues found have been fixed; what follows is what's worth remembering for future development.

---

## Lesson 1. A bug almost always lives in more than one place

The initial review caught that `applyEmoji` in [anonymize.ts](../src/ml/pipelines/anonymize.ts) passed `padding` without `scaleKernel(padding, bboxW)` and hardcoded `'rect'` instead of `resolvedOpts.maskShape`. The fix landed only in the photo pipeline.

The second review pass found **two more copies of the same bug** — in [PreviewCanvas.tsx](../src/components/PreviewCanvas.tsx) (preview) and [anonymizeVideo.ts](../src/ml/pipelines/anonymizeVideo.ts) (video pipeline). The preview was lying to the user: it showed one thing, Apply produced another.

**Lesson:** when fixing a bug in shared logic (e.g. scale-invariant effects), grep on the function signature first to find every call site. Three places apply effects in this codebase: photo pipeline, video pipeline, preview. All three need to stay in sync.

---

## Lesson 2. Race conditions and blob-URL leaks

A long-lived React component with streaming `URL.createObjectURL` is a potential tens-of-megabytes-per-minute leak. Found in [Dropzone](../src/components/Dropzone.tsx) (preview on every drop), [PreviewCanvas](../src/components/PreviewCanvas.tsx) (PNG data URL re-encoded on every slider keystroke), and [videoAnonymizeStore](../src/store/videoAnonymizeStore.ts) (per-track thumbnail URLs).

**Revoke pattern** (now applied throughout the codebase):

```ts
const prevUrlRef = useRef<string | null>(null);

const setUrl = (next: string | null) => {
  const prev = prevUrlRef.current;
  prevUrlRef.current = next;
  setState(next);
  if (prev && prev !== next) URL.revokeObjectURL(prev);  // revoke AFTER set
};

useEffect(() => () => {  // unmount cleanup
  if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
}, []);
```

Revoking BEFORE set caused a "broken image" flash while the browser hadn't picked up the new src yet. Revoking AFTER set is safe — the old URL lives one more frame and dies cleanly.

**Lesson:** every blob URL in long-lived state needs an explicit owner and explicit revoke. Pay special attention to arrays (history, trackMetas) and pseudo-singletons (Zustand stores).

---

## Lesson 3. `setTimeout` of N seconds for revoke is almost always a bug

The old [download.ts](../src/lib/download.ts) did `setTimeout(() => URL.revokeObjectURL(url), 10_000)` after click. That's a race condition: if the user has the "Save as..." dialog enabled and keeps it open for >10 s, the URL dies before the download starts.

The right pattern is `requestAnimationFrame`: after `a.click()` the browser has already initiated the download (captured the blob), and by the next rAF it's safe to revoke.

**Lesson:** don't use "magic delays" to synchronize with user-driven UI events. Either an event ("loaded", "download initiated") or rAF/microtask, but not a round number of seconds.

---

## Lesson 4. Streaming > batch for heavy pipelines

The old `tiling.ts` first called `splitTiles(canvas)` → array of N HTMLCanvasElement → inference → `mergeTiles()`. For 4× upscale of an 8K photo, that required **>10 GB** just for intermediate canvases and Float32 accumulators — guaranteed tab crash.

The fix was a streaming API:

```ts
const coords = planTiles(W, H, opts);          // coordinates only
const merger = new TileMerger(opts, W, H);
for (const coord of coords) {
  const tileCanvas = extractTile(src, coord);  // one tile
  const out = await infer(tileCanvas);
  merger.addTile(coord, out);                  // blend immediately
  // tileCanvas, out drop out of scope here
}
return merger.finalize();
```

Peak memory dropped from "N tiles + accumulators" to "1 tile + accumulators". For a 4K photo this is ~2.6 GB — survives on devices with ≥4 GB RAM.

**Lesson:** if a pipeline has phases "collect everything → process everything → assemble output", consider whether you can incrementally process and accumulate. Especially for anything that scales quadratically or N-fold with input size.

---

## Lesson 5. A worker without crash recovery is a landmine

[inferenceClient.ts](../src/ml/inferenceClient.ts) held a singleton Web Worker. If the worker died (uncaught exception, OOM, killed by browser), its Comlink proxy stayed a valid object — every subsequent `await api.run(...)` would hang forever.

Minimal fix:

```ts
w.addEventListener('error', () => {
  if (worker === w) { worker = null; workerApi = null; }
});
```

The next call to `getInferenceWorker()` spawns a fresh process. ONNX sessions are gone, so each pipeline that caches `sessionReady` must reset it inside a catch block (already the case in `poseEstimate.estimatePoses`).

**Lesson:** a singleton worker is a single point of failure. `error` / `messageerror` handlers are mandatory. Any cached worker state on the main thread either needs try/catch + reset, or self-validation before use.

---

## Lesson 6. Synchronous APIs in the hot loop

`canvas.toDataURL('image/png')` is synchronous and base64-encodes on the main thread. In [PreviewCanvas](../src/components/PreviewCanvas.tsx) it ran on every slider change → visible UI freezes during drag. In [anonymizeVideo](../src/ml/pipelines/anonymizeVideo.ts) it ran for every new track (~5–10 ms blocking on a 1080p frame, ×100 tracks).

Replaced everywhere with `canvas.toBlob(cb, 'image/jpeg', 0.85)` + `URL.createObjectURL(blob)`. Async, GPU-accelerated in Chrome, JPEG produces 5–10× fewer bytes than PNG.

`document.createElement('canvas')` per-frame in the video pipeline was another hot allocation. For 1080p30 in accurate mode that's ~240 MB/s of throwaway canvases. Fix: pre-allocated canvas + `clearRect` before every `sample.draw`.

**Lesson:** in main-thread hot loops, avoid synchronous codecs (`toDataURL`), synchronous decode (`getImageData` on big frames), and any per-iteration allocations. Reuse buffers, prefer async APIs.

---

## Lesson 7. Track ID reuse and stale state

ByteTrack ([faceTracker.ts](../src/ml/tracking/faceTracker.ts)) can hand out the same `trackId` after counter wraparound that belonged to a track that died seconds ago. If the main thread holds `Map<trackId, X>` with old state, that state "sticks" to the new track.

In the video pipeline this would manifest as:
- old emoji on a new face (`trackEmojis`)
- wrong body-derived bbox (`lastBodyBoxes`)
- stale stable kernel width (`trackEffectWidths`)

Fix: GC every frame against `aliveTrackIds`:

```ts
const aliveTrackIds = new Set(trackedFaces.map(t => t.trackId));
for (const id of trackEmojis.keys()) {
  if (!aliveTrackIds.has(id)) trackEmojis.delete(id);
}
```

**Lesson:** if an external library (tracker, physics engine, ECS) hands out IDs, treat them as weak references. Any Map keyed by such IDs needs explicit cleanup, or stale state is just a matter of time.

---

## Lesson 8. Don't duplicate validation constants

`MAX_IMAGE_SIZE`, `ACCEPTED_IMAGE_TYPES`, `HEIC_MIME_TYPES` lived in three files: [Dropzone.tsx](../src/components/Dropzone.tsx), [imageFile.ts](../src/lib/imageFile.ts), [heic.ts](../src/lib/heic.ts). When a new format gets added (e.g. AVIF), the developer fixes one place and forgets the others — drop AVIF works, but "Open another photo" rejects it.

**Lesson:** one source of truth per check. Dropzone now delegates to `readImageFile` instead of duplicating the logic.

---

## Lesson 9. Discriminated unions vs. silent type errors

[pipelineRunner.ts](../src/ml/pipelineRunner.ts) accepted `type: PipelineType` and `options: PipelineOptions` (union of all variants). TypeScript happily allowed passing `inpaint` options to the `anonymize` pipeline — it compiled because of the union's structural typing.

Fix — discriminated union with exhaustiveness check:

```ts
type PipelineCall =
  | { type: 'upscale'; options?: UpscaleOptions }
  | { type: 'anonymize'; options?: AnonymizeOptions }
  // ...

switch (call.type) {
  case 'upscale': /* call.options is UpscaleOptions */ break;
  // ...
  default: const _: never = call; throw new Error(...);
}
```

If anyone adds a new pipeline type or a new field on one variant's options, the `never` check breaks at compile time.

**Lesson:** for multi-method dispatch in TypeScript, a discriminated union is the only path to honest type safety. A bare "type + options" union is the TypeScript equivalent of `any`.

---

## Lesson 10. Doubled work from copy-paste

`parseScrfdDetections`, `parseYunetDetections`, `parseRetinaFaceDetections` each ran `nms(dets, 0.4)` at the end. Then `detectFaces` ran `nms(allFaces, 0.3)` — a global pass on top of the local ones. Double NMS with different thresholds.

This probably happened because each parser was developed in isolation (where local NMS made sense), then later combined into a shared pipeline without revisiting the intermediate steps.

**Lesson:** when merging pipelines, audit which steps become redundant. Local "defensive" passes (NMS, dedup, sort) often need to come out once there's a global post-pass.

---

## Lesson 11. Lazy initial state requires care

```tsx
const [showVideoWizard, setShowVideoWizard] = useState(
  () => useVideoAnonymizeStore.getState().step !== 'idle',
);
useEffect(() => {
  if (videoStep !== 'idle') setShowVideoWizard(true);
}, [videoStep]);
```

This works only because lazy init catches the initial state and useEffect catches subsequent idle→non-idle transitions. If anyone ever simplifies the lazy init, this breaks silently.

**Lesson:** combinations of "lazy init + effect synchronizing the same state" are fragile. Use either an explicit sync-with-store hook or a comment with a warning.

---

## Lesson 12. Defensive ≠ correct: spelled-out > clever

The dynamic key `t('anonymize.effects.' + effect)` saves three lines of code, but i18next-extractor doesn't see dynamic keys — translations silently break under automated extraction. A spelled-out switch is better:

```ts
const effectLabel =
  effect === 'blur' ? t('anonymize.effects.blur')
  : effect === 'pixelate' ? t('anonymize.effects.pixelate')
  : ...;
```

Longer, but static-analysis-friendly, and translators will see every key.

**Lesson:** "clever" code is often hostile to tooling (extractors, type checkers, bundlers). With a finite set of variants, spelled-out is almost always better.

---

## Lesson 13. `<video>` without `key` on `src` change

React reuses the DOM `<video>` element via update vs. unmount/remount, swapping only `src`. The browser keeps showing the last frame of the old video until the new one loads — a visible artifact. `key={url}` forces element recreation.

**Lesson:** for media elements (`<video>`, `<audio>`, sometimes `<img>`) on resource swap, this is almost always required.

---

## Lesson 14. Vectorizing JS loops

Six functions (`canvasToNCHW`, `nchwToCanvas`, `prepareOrtInput`, `prepareRawInput`, `prepareRetinaFaceInput`, `prepareInput`) processed pixels in this shape:

```ts
for (let i = 0; i < N; i++) {
  out[i * 4 + 0] = ...
  out[i * 4 + 1] = ...
  out[i * 4 + 2] = ...
}
```

V8 doesn't always hoist `i * 4` into the induction variable, especially with complex offsets. The canonical form is pointer walk + pre-multiplied constants:

```ts
const inv255 = 1 / 255;
let pi = 0;
for (let i = 0; i < N; i++) {
  out[i] = data[pi] * inv255;
  out[plane + i] = data[pi + 1] * inv255;
  out[2 * plane + i] = data[pi + 2] * inv255;
  pi += 4;
}
```

Bench on M1: ~1.5–2× speedup on a 512×512 tile. For 4K upscale with 256 tiles — 50–100 ms saved.

**Lesson:** if profiling shows a hot JS loop, loop shape matters. Pre-multiplied constants and linear offsets give the optimizer a chance to emit SIMD-friendly code.

---

## Lesson 15. Mounted check for async UI callbacks

Any async handler in a React component that calls `setState` or `toast` must check that the component is still mounted:

```ts
const mountedRef = useRef(true);
useEffect(() => () => { mountedRef.current = false; }, []);

const handleFile = async (file: File) => {
  await heicToJpeg(file);
  if (!mountedRef.current) return;
  toast({ title: 'OK' });
};
```

Without this — console warning, potential leak through closure over the state setter, and UI mismatch (a toast from a file the user already cancelled).

**Lesson:** `mountedRef` is the standard pattern for React hooks doing async work. Should be in every component performing HEIC conversion, ML inference, or fetch.

---

## Conclusion

Most bugs in this project were not algorithmic — they were **hygienic**:
- forgotten blob-URL revoke
- forgotten useEffect cleanup
- copy-paste between photo/video pipelines without subsequent unification
- defensive code in the wrong layer (double NMS)
- fragile lazy-init + effect couplings

These bugs are nearly invisible in ordinary code review (compiles, tests pass, "works in the browser"), but they accumulate and at some point manifest as "the app eats 4 GB of RAM after a minute of use" or "the mask stuck to a different person's face after a video cut".

Prevention: regular memory profiling, explicit blob-URL ownership audits, shared validation constants, discriminated unions for multi-method dispatch, mounted checks for async handlers.
