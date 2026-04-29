import type { AnonymizeEffect, MaskShape } from '@/ml/utils/anonymizeEffects';
import { create } from 'zustand';

export type VideoAnonymizeStep = 'idle' | 'loaded' | 'processing' | 'done';

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
  progress: number;
  outputBlob: Blob | null;
  outputUrl: string | null;

  setFile: (file: File, info: { duration: number; fps: number; width: number; height: number; frameCount: number }) => void;
  setStep: (step: VideoAnonymizeStep) => void;
  setEffect: (effect: AnonymizeEffect) => void;
  setBlurRadius: (r: number) => void;
  setPixelateSize: (s: number) => void;
  setSolidColor: (c: string) => void;
  setModelId: (id: string) => void;
  setPadding: (v: number) => void;
  setFeather: (v: number) => void;
  setMaskShape: (v: MaskShape) => void;
  setProgress: (p: number) => void;
  setOutput: (blob: Blob, url: string) => void;
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
  pixelateSize: 16,
  solidColor: '#000000',
  modelId: 'scrfd-500m',
  padding: 4,
  feather: 4,
  maskShape: 'ellipse' as MaskShape,
  progress: 0,
  outputBlob: null as Blob | null,
  outputUrl: null as string | null,
};

export const useVideoAnonymizeStore = create<VideoAnonymizeState>((set) => ({
  ...initialState,

  setFile: (file, info) => set({ step: 'loaded', file, videoUrl: URL.createObjectURL(file), ...info }),
  setStep: (step) => set({ step }),
  setEffect: (effect) => set({ effect }),
  setBlurRadius: (blurRadius) => set({ blurRadius }),
  setPixelateSize: (pixelateSize) => set({ pixelateSize }),
  setSolidColor: (solidColor) => set({ solidColor }),
  setModelId: (modelId) => set({ modelId }),
  setPadding: (padding) => set({ padding }),
  setFeather: (feather) => set({ feather }),
  setMaskShape: (maskShape) => set({ maskShape }),
  setProgress: (progress) => set({ progress }),
  setOutput: (outputBlob, outputUrl) => set({ step: 'done', progress: 100, outputBlob, outputUrl }),

  reset: () => {
    const s = useVideoAnonymizeStore.getState();
    if (s.videoUrl && !s.outputUrl) URL.revokeObjectURL(s.videoUrl);
    if (s.outputUrl) URL.revokeObjectURL(s.outputUrl);
    set(initialState);
  },
}));
