# Код-ревью PhotoRestore Web

Этот документ — не журнал багов, а конспект уроков, извлечённых из четырёх проходов код-ревью (Kimi Code CLI + Claude). Все найденные проблемы исправлены — ниже только то, что стоит помнить при дальнейшей разработке.

---

## Урок 1. Один баг почти всегда живёт в нескольких местах

Изначальное ревью нашло, что `applyEmoji` в [anonymize.ts](../src/ml/pipelines/anonymize.ts) передавал `padding` без `scaleKernel(padding, bboxW)` и хардкодил `'rect'` вместо `resolvedOpts.maskShape`. Фикс был сделан только в фото-пайплайне.

При втором проходе обнаружились **ещё две копии того же бага** — в [PreviewCanvas.tsx](../src/components/PreviewCanvas.tsx) (превью) и [anonymizeVideo.ts](../src/ml/pipelines/anonymizeVideo.ts) (видео-пайплайн). Превью «лгало» пользователю: показывало одно, после Apply получалось другое.

**Урок:** при фиксе бага в общей логике (например, scale-invariant эффекты) первым делом — `grep` по сигнатуре функции, чтобы найти все вызовы. У нас три места применяли эффекты: фото-пайплайн, видео-пайплайн, превью. Все три должны быть согласованы.

---

## Урок 2. Гонки и утечки blob-URL

Долгоживущий React-компонент с потоковыми `URL.createObjectURL` — это потенциальная утечка размером в десятки мегабайт за минуту. Найдено в [Dropzone](../src/components/Dropzone.tsx) (превью при каждом drop), в [PreviewCanvas](../src/components/PreviewCanvas.tsx) (PNG data URL пересоздавался на каждый keystroke слайдера) и в [videoAnonymizeStore](../src/store/videoAnonymizeStore.ts) (thumbnail URL'ы треков).

**Паттерн revoke** (применяется по всему коду):

```ts
const prevUrlRef = useRef<string | null>(null);

const setUrl = (next: string | null) => {
  const prev = prevUrlRef.current;
  prevUrlRef.current = next;
  setState(next);
  if (prev && prev !== next) URL.revokeObjectURL(prev);  // revoke ПОСЛЕ set
};

useEffect(() => () => {  // unmount cleanup
  if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
}, []);
```

Revoke ДО set приводил к мерцанию «битого изображения» пока браузер не подхватит новый src. Revoke ПОСЛЕ set безопасен — старый URL живёт ещё одну frame и спокойно умирает.

**Урок:** для всех blob-URL в long-lived состоянии нужен явный owner и явный revoke. Особое внимание — массивам (history, trackMetas) и pseudo-singletons (Zustand stores).

---

## Урок 3. `setTimeout` на 10 секунд для revoke — почти всегда баг

Старый [download.ts](../src/lib/download.ts) делал `setTimeout(() => URL.revokeObjectURL(url), 10_000)` после клика. Это race condition: если у пользователя включён диалог «Save as…» и он держит его открытым >10 с, URL умирает до начала загрузки.

Правильный паттерн — `requestAnimationFrame`: после `a.click()` браузер уже инициировал download (захватил blob), к следующему rAF мы можем безопасно revoke.

**Урок:** не используйте «магические задержки» для синхронизации с user-driven UI событиями. Либо событие («loaded», «download initiated»), либо rAF/microtask, но не круглое число секунд.

---

## Урок 4. Streaming > batch для тяжёлых пайплайнов

Старая `tiling.ts` сначала вызывала `splitTiles(canvas)` → массив из N HTMLCanvasElement → инференс → `mergeTiles()`. Для апскейла 4× от 8K-фото это требовало **>10 ГБ** только под промежуточные канвасы и аккумуляторы Float32 — гарантированный краш вкладки.

Решение — streaming API:

```ts
const coords = planTiles(W, H, opts);          // только координаты
const merger = new TileMerger(opts, W, H);
for (const coord of coords) {
  const tileCanvas = extractTile(src, coord);  // одна плитка
  const out = await infer(tileCanvas);
  merger.addTile(coord, out);                  // блендинг сразу
  // tileCanvas, out — drop из scope
}
return merger.finalize();
```

Пиковая память сократилась с «N тайлов + аккумуляторы» до «1 тайл + аккумуляторы». Для 4K-фото это ~2.6 ГБ — выживает на устройствах с ≥4 ГБ ОЗУ.

**Урок:** если пайплайн имеет фазы «собрать всё → обработать всё → собрать выход», подумайте, можно ли инкрементально обрабатывать и накапливать. Особенно для всего, что зависит от размера входа квадратично или N-кратно.

---

## Урок 5. Worker без crash-recovery — мина

[inferenceClient.ts](../src/ml/inferenceClient.ts) держал singleton Web Worker. Если воркер падал (uncaught exception, OOM, killed by browser), его Comlink-прокси оставался валидным объектом — все следующие `await api.run(...)` зависали навсегда.

Минимальный fix:

```ts
w.addEventListener('error', () => {
  if (worker === w) { worker = null; workerApi = null; }
});
```

Следующий вызов `getInferenceWorker()` поднимет свежий процесс. Сессии при этом теряются — поэтому каждый пайплайн, кэширующий `sessionReady`, должен сбрасывать его в catch-блоке (как сделано в `poseEstimate.estimatePoses`).

**Урок:** singleton-воркер == single point of failure. `error` / `messageerror` обработчики обязательны. Любой кэш состояния воркера на главном потоке нужен либо try/catch + reset, либо self-validation перед использованием.

---

## Урок 6. Синхронные API в горячем цикле

`canvas.toDataURL('image/png')` — синхронный, кодирует в base64 на main thread. В [PreviewCanvas](../src/components/PreviewCanvas.tsx) он вызывался на каждое изменение слайдера → визуальные фризы при перетаскивании. В [anonymizeVideo](../src/ml/pipelines/anonymizeVideo.ts) — на каждый новый трек (~5–10 мс блокировки на 1080p frame, ×100 треков).

Замена везде: `canvas.toBlob(cb, 'image/jpeg', 0.85)` + `URL.createObjectURL(blob)`. Async, GPU-accelerated в Chrome, JPEG сжимает в 5–10× меньше байтов чем PNG.

`document.createElement('canvas')` per-frame в видео-пайплайне — тоже горячая аллокация. Для 1080p30 в accurate mode это ~240 МБ/с временных canvas'ов. Решение — pre-allocated canvas + `clearRect` перед каждым `sample.draw`.

**Урок:** в hot loops главного потока избегайте синхронных кодеков (`toDataURL`), синхронных decode (`getImageData` на больших frames), и любых per-iteration аллокаций. Reuse buffers, prefer async APIs.

---

## Урок 7. Track ID reuse и stale state

ByteTrack ([faceTracker.ts](../src/ml/tracking/faceTracker.ts)) после переполнения счётчика может выдать тот же `trackId`, что был у умершего трека несколько секунд назад. Если на главном потоке висят `Map<trackId, X>` со старым состоянием — оно «прилипает» к новому треку.

В видео-пайплайне это проявлялось бы как:
- старый эмодзи на новом лице (`trackEmojis`)
- неправильное body-derived bbox (`lastBodyBoxes`)
- устаревшая stable kernel width (`trackEffectWidths`)

Фикс — GC в каждом кадре по `aliveTrackIds`:

```ts
const aliveTrackIds = new Set(trackedFaces.map(t => t.trackId));
for (const id of trackEmojis.keys()) {
  if (!aliveTrackIds.has(id)) trackEmojis.delete(id);
}
```

**Урок:** если внешняя библиотека (трекер, физический движок, ECS) выдаёт ID, относитесь к ним как к weak references. Любой Map поверх таких ID должен явно чиститься, иначе stale state — это вопрос времени.

---

## Урок 8. Не дублируйте константы валидации

`MAX_IMAGE_SIZE`, `ACCEPTED_IMAGE_TYPES`, `HEIC_MIME_TYPES` жили в трёх файлах: [Dropzone.tsx](../src/components/Dropzone.tsx), [imageFile.ts](../src/lib/imageFile.ts), [heic.ts](../src/lib/heic.ts). При добавлении нового формата (AVIF) программист поправит одно место и не вспомнит про два других — пользователь сможет дроп AVIF, но не сможет открыть его через «Open another photo».

**Урок:** один источник правды для каждой проверки. Dropzone теперь делегирует в `readImageFile`, не дублирует логику.

---

## Урок 9. Discriminated unions против тихих type errors

[pipelineRunner.ts](../src/ml/pipelineRunner.ts) принимал `type: PipelineType` и `options: PipelineOptions` (union всех возможных). TypeScript позволял передать `inpaint` options в `anonymize` pipeline — компилировалось из-за structural typing union'а.

Решение — discriminated union с exhaustiveness check:

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

Если кто-то добавит новый pipeline type или новое поле в одну из options — `never`-проверка сломается на этапе компиляции.

**Урок:** для multi-method dispatch в TypeScript discriminated union — единственный способ получить честную type safety. Голый union «type + options» — это TypeScript-эквивалент `any`.

---

## Урок 10. Двойная работа из паттерна copy-paste

`parseScrfdDetections`, `parseYunetDetections`, `parseRetinaFaceDetections` все делали `nms(dets, 0.4)` в конце. И затем `detectFaces` делал `nms(allFaces, 0.3)` — global pass поверх локальных. Двойной NMS с разными порогами.

Вероятно, написано так потому, что каждый parser сначала разрабатывался отдельно (в нём имело смысл NMS), а потом их объединили в общий pipeline без рефакторинга промежуточных шагов.

**Урок:** при объединении pipeline'ов проверяйте, какие шаги становятся избыточными. Локальные «защитные» проходы (NMS, dedup, sort) часто нужно убрать, если есть глобальный пост-проход.

---

## Урок 11. Lazy initial state требует осторожности

```tsx
const [showVideoWizard, setShowVideoWizard] = useState(
  () => useVideoAnonymizeStore.getState().step !== 'idle',
);
useEffect(() => {
  if (videoStep !== 'idle') setShowVideoWizard(true);
}, [videoStep]);
```

Это работает только потому, что lazy init ловит начальное состояние, а useEffect — последующие переходы idle→non-idle. Если кто-то когда-нибудь упростит lazy init, это сломается тихо.

**Урок:** комбинации «lazy init + effect синхронизирующий тот же стейт» хрупки. Либо явный sync-with-store hook, либо комментарий с предупреждением.

---

## Урок 12. Defensive ≠ correct: spelled-out > clever

Динамический ключ `t('anonymize.effects.' + effect)` экономит 3 строки кода, но i18next-extractor не видит динамические ключи — переводы тихо отвалятся при автоматизированной экстракции. Лучше spelled-out switch:

```ts
const effectLabel =
  effect === 'blur' ? t('anonymize.effects.blur')
  : effect === 'pixelate' ? t('anonymize.effects.pixelate')
  : ...;
```

Длиннее, но static analysis-friendly и переводчики увидят все ключи.

**Урок:** «умный» код часто враждебен инструментам (extractors, type checkers, bundlers). Если есть конечное множество вариантов — spelled-out почти всегда лучше.

---

## Урок 13. `<video>` без `key` при смене `src`

React переиспользует DOM-элемент `<video>` через update vs unmount/remount, меняя только `src`. Браузер при этом продолжает показывать последний кадр старого видео, пока не загрузит новый — визуальный артефакт. `key={url}` форсирует пересоздание элемента.

**Урок:** для media-элементов (`<video>`, `<audio>`, иногда `<img>`) при ресурс-смене это почти всегда нужно.

---

## Урок 14. Векторизация JS-циклов

Шесть функций (`canvasToNCHW`, `nchwToCanvas`, `prepareOrtInput`, `prepareRawInput`, `prepareRetinaFaceInput`, `prepareInput`) обрабатывали пиксели в форме:

```ts
for (let i = 0; i < N; i++) {
  out[i * 4 + 0] = ...
  out[i * 4 + 1] = ...
  out[i * 4 + 2] = ...
}
```

V8 не всегда вытаскивает `i * 4` в индукционную переменную, особенно при сложных смещениях. Каноническая форма — pointer walk + pre-multiplied constants:

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

Бенч на M1: ~1.5–2× ускорение для тайла 512×512. Для апскейла 4K с 256 тайлами — 50–100 мс.

**Урок:** если профилирование показывает hot loop в JS, форма цикла важна. Pre-multiplied constants и линейные смещения дают оптимизатору шанс генерировать SIMD-friendly код.

---

## Урок 15. Mounted check для async UI коллбэков

Любой async обработчик в React-компоненте, дёргающий `setState` или `toast`, должен проверять, что компонент всё ещё смонтирован:

```ts
const mountedRef = useRef(true);
useEffect(() => () => { mountedRef.current = false; }, []);

const handleFile = async (file: File) => {
  await heicToJpeg(file);
  if (!mountedRef.current) return;
  toast({ title: 'OK' });
};
```

Без этого — warning в консоли, потенциальная утечка через замыкание над state setter, и UI mismatch (toast от файла, который пользователь уже отменил).

**Урок:** `mountedRef` — стандартный паттерн для React-хуков с async work. Должен быть в каждом компоненте, который делает HEIC-конверсию, ML-инференс или fetch.

---

## Заключение

Большинство багов в проекте — не алгоритмические, а **гигиенические**:
- забытый revoke у blob-URL
- забытое cleanup в useEffect
- копипаста между фото/видео-пайплайнами без последующей унификации
- defensive код в неправильных слоях (двойной NMS)
- хрупкие связки lazy init + effect

Такие баги почти невидимы в обычном code review (компилируется, тесты проходят, в браузере «работает»), но накапливаются и в какой-то момент проявляются как «приложение жрёт 4 ГБ через минуту использования» или «маска прилипла к лицу другого человека после видео-cut».

Профилактика: regular memory profiling, явный аудит blob-URL ownership, общие константы валидации, discriminated unions для multi-method dispatch, mounted-checks для async хендлеров.
