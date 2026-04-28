import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ComputeBackend = 'webgpu' | 'wasm';
export type Theme = 'light' | 'dark' | 'system';

interface SettingsState {
  backend: ComputeBackend;
  theme: Theme;
  language: string;
  tileSize: number;
  tileOverlap: number;
  setBackend: (backend: ComputeBackend) => void;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: string) => void;
  setTileSize: (size: number) => void;
  setTileOverlap: (overlap: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      backend: 'webgpu',
      theme: 'system',
      language: 'en',
      tileSize: 512,
      tileOverlap: 32,

      setBackend: (backend) => set({ backend }),
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
      setLanguage: (language) => set({ language }),
      setTileSize: (tileSize) => set({ tileSize }),
      setTileOverlap: (tileOverlap) => set({ tileOverlap }),
    }),
    {
      name: 'photorestore-settings',
      partialize: (state) => ({
        backend: state.backend,
        theme: state.theme,
        language: state.language,
        tileSize: state.tileSize,
        tileOverlap: state.tileOverlap,
      }),
    }
  )
);

/** Apply theme class to document root */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}
