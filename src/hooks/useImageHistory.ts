import { useCallback } from 'react';
import { useEditorStore, type HistoryEntry } from '@/store/editorStore';

/** Hook providing image history helpers */
export function useImageHistory() {
  const { history, pushHistory, revertTo, currentImageUrl } = useEditorStore();

  const saveSnapshot = useCallback(
    (label: string) => {
      if (!currentImageUrl) return;
      pushHistory({ imageUrl: currentImageUrl, label });
    },
    [currentImageUrl, pushHistory]
  );

  const restore = useCallback(
    (entry: HistoryEntry) => {
      revertTo(entry.id);
    },
    [revertTo]
  );

  return { history, saveSnapshot, restore };
}
