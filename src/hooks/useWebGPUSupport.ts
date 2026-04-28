import { useEffect, useState } from 'react';

export type WebGPUStatus = 'checking' | 'available' | 'unavailable';

/** Check whether WebGPU is available in the current browser */
export function useWebGPUSupport(): WebGPUStatus {
  const [status, setStatus] = useState<WebGPUStatus>('checking');

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!('gpu' in navigator)) {
        if (!cancelled) setStatus('unavailable');
        return;
      }
      try {
        const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } })
          .gpu;
        const adapter = await gpu?.requestAdapter();
        if (!cancelled) {
          setStatus(adapter ? 'available' : 'unavailable');
        }
      } catch {
        if (!cancelled) setStatus('unavailable');
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
