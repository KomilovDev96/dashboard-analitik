import { useCallback, useRef } from 'react';
import { mrpApi } from '../api/mrp';
import { useMrpStore } from '../stores/mrpStore';
import { message } from 'antd';

export const useMrpStream = () => {
  const closeRef = useRef<(() => void) | null>(null);
  const { filters, startStream, stopStream, setStreamProgress, setStreamData } = useMrpStore();

  const start = useCallback(() => {
    closeRef.current?.();
    startStream();

    const close = mrpApi.streamReport(
      filters,
      (event) => {
        setStreamProgress(
          event.pct,
          event.message ?? `${event.pct}%`,
          event.loaded,
          event.total,
        );
      },
      (data, total) => {
        setStreamData(data, total);
        stopStream();
      },
      (errMsg) => {
        stopStream();
        message.error(`Ошибка загрузки: ${errMsg}`);
      },
    );

    closeRef.current = close;
  }, [filters, startStream, stopStream, setStreamProgress, setStreamData]);

  const stop = useCallback(() => {
    closeRef.current?.();
    stopStream();
  }, [stopStream]);

  return { start, stop };
};
