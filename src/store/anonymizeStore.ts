import { create } from 'zustand';
import type { FaceBox } from '@/ml/utils/faceDetect';
import type { AnonymizeEffect, MaskShape } from '@/ml/utils/anonymizeEffects';

export type AnonymizeStep = 'idle' | 'detecting' | 'editing' | 'applying';

export const EMOJI_POPULAR = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊',
  '😇', '😍', '🤩', '😘', '😗', '😚', '😋', '😛', '😜', '🤪',
  '😎', '🤓', '🧐', '🥳', '😏', '😶', '😐', '😑', '😬', '🙄',
  '🤔', '🤗', '🤭', '🐱', '🐶', '🐼', '🐨', '🐸', '🦊', '🐰',
  '🫠', '🥴', '😵', '🤯', '🤠', '😈', '👻', '💀', '🎃', '🤡',
];

function genRandomEmojis(count: number): string[] {
  return Array.from({ length: count }, () =>
    EMOJI_POPULAR[Math.floor(Math.random() * EMOJI_POPULAR.length)]
  );
}

interface AnonymizeState {
  step: AnonymizeStep;
  faces: FaceBox[];
  effect: AnonymizeEffect;
  blurRadius: number;
  pixelateSize: number;
  solidColor: string;
  modelId: string;
  preview: boolean;
  emojiInput: string;
  emojiRandom: boolean;
  padding: number;
  feather: number;
  maskShape: MaskShape;
  randomEmojis: string[];

  setStep: (step: AnonymizeStep) => void;
  setFaces: (faces: FaceBox[]) => void;
  updateFace: (index: number, box: FaceBox) => void;
  deleteFace: (index: number) => void;
  addFace: (box: FaceBox) => void;
  setEffect: (effect: AnonymizeEffect) => void;
  setBlurRadius: (r: number) => void;
  setPixelateSize: (s: number) => void;
  setSolidColor: (c: string) => void;
  setModelId: (id: string) => void;
  setPreview: (v: boolean) => void;
  setEmojiInput: (v: string) => void;
  setEmojiRandom: (v: boolean) => void;
  setPadding: (v: number) => void;
  setFeather: (v: number) => void;
  setMaskShape: (v: MaskShape) => void;
  refreshRandomEmojis: () => void;
  reset: () => void;
}

const initialState = {
  step: 'idle' as AnonymizeStep,
  faces: [] as FaceBox[],
  effect: 'pixelate' as AnonymizeEffect,
  blurRadius: 12,
  pixelateSize: 8,
  solidColor: '#000000',
  modelId: 'scrfd-500m',
  preview: false,
  emojiInput: '😶',
  emojiRandom: false,
  padding: 4,
  feather: 0,
  maskShape: 'rect' as MaskShape,
  randomEmojis: [] as string[],
};

export const useAnonymizeStore = create<AnonymizeState>((set, get) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  setFaces: (faces) => {
    const state = get();
    const randomEmojis = state.emojiRandom ? genRandomEmojis(faces.length) : state.randomEmojis;
    set({ faces, step: faces.length > 0 ? 'editing' : 'idle', randomEmojis });
  },

  updateFace: (index, box) =>
    set((state) => {
      const faces = [...state.faces];
      if (index >= 0 && index < faces.length) {
        faces[index] = box;
      }
      return { faces };
    }),

  deleteFace: (index) =>
    set((state) => ({
      faces: state.faces.filter((_, i) => i !== index),
      step: state.faces.length <= 1 ? 'idle' : state.step,
    })),

  addFace: (box) =>
    set((state) => {
      const faces = [...state.faces, box];
      const randomEmojis = state.emojiRandom ? [...state.randomEmojis, EMOJI_POPULAR[Math.floor(Math.random() * EMOJI_POPULAR.length)]] : state.randomEmojis;
      return { faces, step: 'editing', randomEmojis };
    }),

  setEffect: (effect) => set({ effect }),
  setBlurRadius: (blurRadius) => set({ blurRadius }),
  setPixelateSize: (pixelateSize) => set({ pixelateSize }),
  setSolidColor: (solidColor) => set({ solidColor }),
  setModelId: (modelId) => set({ modelId }),
  setPreview: (preview) => set({ preview }),
  setEmojiInput: (emojiInput) => set({ emojiInput }),
  setEmojiRandom: (emojiRandom) => {
    const faces = get().faces;
    set({
      emojiRandom,
      randomEmojis: emojiRandom ? genRandomEmojis(faces.length) : [],
    });
  },
  setPadding: (padding) => set({ padding }),
  setFeather: (feather) => set({ feather }),
  setMaskShape: (maskShape) => set({ maskShape }),

  refreshRandomEmojis: () => {
    const { emojiRandom, faces } = get();
    if (emojiRandom) set({ randomEmojis: genRandomEmojis(faces.length) });
  },

  reset: () => set(initialState),
}));
