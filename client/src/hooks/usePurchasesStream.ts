import { useCallback, useRef } from 'react';
import { purchasesApi } from '../api/purchases';
import { usePurchasesStore } from '../stores/purchasesStore';

export const usePurchasesStream = (onError?: (msg: string) => void) => {
  const closeRef    = useRef<(() => void) | null>(null);
  const filters     = usePurchasesStore((s) => s.filters);
  const startStream = usePurchasesStore((s) => s.startStream);
  const stopStream  = usePurchasesStore((s) => s.stopStream);
  const setProgress = usePurchasesStore((s) => s.setProgress);
  const setData     = usePurchasesStore((s) => s.setData);

  const start = useCallback(() => {
    closeRef.current?.();
    startStream();

    const close = purchasesApi.streamReport(
      filters,
      (e) => setProgress(e.pct, e.message ?? `${e.pct}%`, e.loaded, e.total),
      (data, total) => { setData(data, total); stopStream(); },
      (err) => { stopStream(); onError?.(`Ошибка загрузки: ${err}`); },
    );

    closeRef.current = close;
  }, [filters, startStream, stopStream, setProgress, setData, onError]);

  const stop = useCallback(() => {
    closeRef.current?.();
    stopStream();
  }, [stopStream]);

  return { start, stop };
};
