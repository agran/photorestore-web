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
    const { originalImageUrl } = get();
    set({
      currentImageUrl: url,
      originalImageUrl: originalImageUrl ?? url,
    });
  },

  loadNewImage: (url) =>
    set({
      currentImageUrl: url,
      originalImageUrl: url,
    }),

  pushHistory: (entry) => {
    const id = crypto.randomUUID();
    set((state) => ({
      history: [{ ...entry, id, timestamp: Date.now() }, ...state.history].slice(0, 20), // keep last 20 entries
    }));
  },

  revertTo: (id) => {
    const { history } = get();
    const entry = history.find((h) => h.id === id);
    if (entry) {
      set({ currentImageUrl: entry.imageUrl });
    }
  },

  setJob: (job) => set({ activeJob: job }),

  updateJobProgress: (progress) =>
    set((state) => (state.activeJob ? { activeJob: { ...state.activeJob, progress } } : {})),

  reset: () =>
    set({
      currentImageUrl: null,
      originalImageUrl: null,
      history: [],
      activeJob: null,
    }),
}));
