import { create } from 'zustand';

export interface HistoryEntry {
  id: string;
  imageUrl: string;
  label: string;
  timestamp: number;
}

export type JobStatus = 'idle' | 'running' | 'done' | 'error';

export interface ProcessingJob {
  id: string;
  pipeline: string;
  status: JobStatus;
  progress: number;
  error?: string;
}

interface EditorState {
  /** Current image as object URL */
  currentImageUrl: string | null;
  /** Original image object URL (before any processing) */
  originalImageUrl: string | null;
  history: HistoryEntry[];
  activeJob: ProcessingJob | null;
  setImage: (url: string) => void;
  /** Replace both current and original with a freshly uploaded photo —
   * unlike setImage which preserves originalImageUrl as the first-ever
   * load, this is for "I want to start from a different photo". */
  loadNewImage: (url: string) => void;
  pushHistory: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
  revertTo: (id: string) => void;
  setJob: (job: ProcessingJob | null) => void;
  updateJobProgress: (progress: number) => void;
  reset: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  currentImageUrl: null,
  originalImageUrl: null,
  history: [],
  activeJob: null,

  setImage: (url) => {
    const { originalImageUrl, currentImageUrl } = get();
    if (currentImageUrl && currentImageUrl !== originalImageUrl && currentImageUrl !== url) {
      URL.revokeObjectURL(currentImageUrl);
    }
    set({
      currentImageUrl: url,
      originalImageUrl: originalImageUrl ?? url,
    });
  },

  loadNewImage: (url) => {
    const { currentImageUrl } = get();
    if (currentImageUrl && currentImageUrl !== url) {
      URL.revokeObjectURL(currentImageUrl);
    }
    set({
      currentImageUrl: url,
      originalImageUrl: url,
    });
  },

  pushHistory: (entry) => {
    const id = crypto.randomUUID();
    set((state) => {
      const next = [{ ...entry, id, timestamp: Date.now() }, ...state.history];
      const evicted = next.slice(20);
      for (const e of evicted) {
        URL.revokeObjectURL(e.imageUrl);
      }
      return { history: next.slice(0, 20) };
    });
  },

  revertTo: (id) => {
    // By design: jumping to a history entry doesn't push a new entry — the
    // history panel itself is the navigation UI, and re-pushing the same URL
    // would create a "revert to revert" loop in the list. The entry's blob
    // URL is shared with the history slot so we don't revoke `currentImageUrl`
    // here either.
    const { history } = get();
    const entry = history.find((h) => h.id === id);
    if (entry) {
      set({ currentImageUrl: entry.imageUrl });
    }
  },

  setJob: (job) => set({ activeJob: job }),

  updateJobProgress: (progress) =>
    set((state) => (state.activeJob ? { activeJob: { ...state.activeJob, progress } } : {})),

  reset: () => {
    const state = get();
    if (state.currentImageUrl) URL.revokeObjectURL(state.currentImageUrl);
    if (state.originalImageUrl && state.originalImageUrl !== state.currentImageUrl) {
      URL.revokeObjectURL(state.originalImageUrl);
    }
    for (const entry of state.history) {
      URL.revokeObjectURL(entry.imageUrl);
    }
    return set({
      currentImageUrl: null,
      originalImageUrl: null,
      history: [],
      activeJob: null,
    });
  },
}));
