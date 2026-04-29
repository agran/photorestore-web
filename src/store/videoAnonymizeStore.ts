import type { AnonymizeEffect, MaskShape } from '@/ml/utils/anonymizeEffects';
import { create } from 'zustand';

export type VideoAnonymizeStep = 'idle' | 'loaded' | 'processing' | 'done';
export type VideoAnonymizeQuality = 'fast' | 'accurate';

interface VideoAnonymizeState {
  step: VideoAnonymizeStep;
  file: File | null;
  videoUrl: string | null;
  duration: number;
  fps: number;
  width: number;
  height: number;
  frameCount: number;
  effect: AnonymizeEffect;
  blurRadius: number;
  pixelateSize: number;
  solidColor: string;
  modelId: string;
  padding: number;
  feather: number;
  maskShape: MaskShape;
  emojiInput: string;
  emojiRandom: boolean;
  quality: VideoAnonymizeQuality;
  bodyTracking: boolean;
  progress: number;
  aborted: boolean;
  startTime: number;
  outputBlob: Blob | null;
  outputUrl: string | null;
  outputExt: string;

  setFile: (file: File, info: { duration: number; fps: number; width: number; height: number; frameCount: number }) => void;
  /** Load a video file, read its metadata, and transition to step='loaded'. */
  loadFile: (file: File) => Promise<void>;
  setStep: (step: VideoAnonymizeStep) => void;
  setEffect: (effect: AnonymizeEffect) => void;
  setBlurRadius: (r: number) => void;
  setPixelateSize: (s: number) => void;
  setSolidColor: (c: string) => void;
  setModelId: (id: string) => void;
  setPadding: (v: number) => void;
  setFeather: (v: number) => void;
  setMaskShape: (v: MaskShape) => void;
  setEmojiInput: (v: string) => void;
  setEmojiRandom: (v: boolean) => void;
  setQuality: (v: VideoAnonymizeQuality) => void;
  setBodyTracking: (v: boolean) => void;
  setProgress: (p: number) => void;
  setAborted: (v: boolean) => void;
  setStartTime: (t: number) => void;
  setOutput: (blob: Blob, url: string, ext: string) => void;
  /** Return to step='loaded' so the user can tweak params and re-process. */
  editAgain: () => void;
  /** Return to step='done' to view the already-processed result. */
  showResult: () => void;
  reset: () => void;
}

const initialState = {
  step: 'idle' as VideoAnonymizeStep,
  file: null as File | null,
  videoUrl: null as string | null,
  duration: 0,
  fps: 0,
  width: 0,
  height: 0,
  frameCount: 0,
  effect: 'pixelate' as AnonymizeEffect,
  blurRadius: 4,
  pixelateSize: 10,
  solidColor: '#000000',
  modelId: 'scrfd-10g',
  padding: 16,
  feather: 4,
  maskShape: 'ellipse' as MaskShape,
  emojiInput: '😶',
  emojiRandom: true,
  quality: 'fast' as VideoAnonymizeQuality,
  bodyTracking: true,
  progress: 0,
  aborted: false,
  startTime: 0,
  outputBlob: null as Blob | null,
  outputUrl: null as string | null,
  outputExt: 'mp4',
};

export const useVideoAnonymizeStore = create<VideoAnonymizeState>((set, get) => ({
  ...initialState,

  setFile: (file, info) => {
    const prev = get();
    if (prev.videoUrl) URL.revokeObjectURL(prev.videoUrl);
    if (prev.outputUrl) URL.revokeObjectURL(prev.outputUrl);
    set({
      step: 'loaded', file, videoUrl: URL.createObjectURL(file), ...info,
      outputBlob: null, outputUrl: null, progress: 0, aborted: false,
    });
  },

  loadFile: (file) => new Promise<void>((resolve, reject) => {
    const prev = get();
    if (prev.videoUrl) URL.revokeObjectURL(prev.videoUrl);
    if (prev.outputUrl) URL.revokeObjectURL(prev.outputUrl);

    const url = URL.createObjectURL(file);
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.muted = true;
    vid.src = url;
    vid.onloadedmetadata = () => {
      const fps = 30;
      set({
        step: 'loaded',
        file,
        videoUrl: url,
        duration: vid.duration,
        fps,
        width: vid.videoWidth,
        height: vid.videoHeight,
        frameCount: Math.round(vid.duration * fps),
        // Replacing the source video — drop any previous result so settings
        // are preserved but the user starts fresh.
        outputBlob: null,
        outputUrl: null,
        progress: 0,
        aborted: false,
      });
      vid.remove();
      resolve();
    };
    vid.onerror = () => {
      URL.revokeObjectURL(url);
      vid.remove();
      reject(new Error('Failed to load video metadata'));
    };
  }),
  setStep: (step) => set({ step }),
  setEffect: (effect) => set({ effect }),
  setBlurRadius: (blurRadius) => set({ blurRadius }),
  setPixelateSize: (pixelateSize) => set({ pixelateSize }),
  setSolidColor: (solidColor) => set({ solidColor }),
  setModelId: (modelId) => set({ modelId }),
  setPadding: (padding) => set({ padding }),
  setFeather: (feather) => set({ feather }),
  setMaskShape: (maskShape) => set({ maskShape }),
  setEmojiInput: (emojiInput) => set({ emojiInput }),
  setEmojiRandom: (emojiRandom) => set({ emojiRandom }),
  setQuality: (quality) => set({ quality }),
  setBodyTracking: (bodyTracking) => set({ bodyTracking }),
  setProgress: (progress) => set({ progress }),
  setAborted: (aborted) => set({ aborted }),
  setStartTime: (startTime) => set({ startTime }),
  setOutput: (outputBlob, outputUrl, outputExt) => {
    const prev = get();
    if (prev.outputUrl && prev.outputUrl !== outputUrl) URL.revokeObjectURL(prev.outputUrl);
    set({ step: 'done', progress: 100, outputBlob, outputUrl, outputExt });
  },

  editAgain: () => set({ step: 'loaded', progress: 0, aborted: false }),

  showResult: () => set({ step: 'done', progress: 100 }),

  reset: () => {
    const s = get();
    if (s.videoUrl && !s.outputUrl) URL.revokeObjectURL(s.videoUrl);
    if (s.outputUrl) URL.revokeObjectURL(s.outputUrl);
    set(initialState);
  },
}));
