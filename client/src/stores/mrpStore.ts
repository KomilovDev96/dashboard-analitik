import { create } from 'zustand';
import type { MrpRow, MrpFilters } from '../types';

interface StreamState {
  isStreaming: boolean;
  progress: number;
  progressMessage: string;
  loaded: number;
  total: number;
}

interface MrpState {
  filters: MrpFilters;
  data: MrpRow[];
  totalRows: number;
  stream: StreamState;

  setFilters: (filters: Partial<MrpFilters>) => void;
  resetFilters: () => void;
  setStreamData: (data: MrpRow[], total: number) => void;
  setStreamProgress: (pct: number, message: string, loaded?: number, total?: number) => void;
  startStream: () => void;
  stopStream: () => void;
}

const defaultFilters: MrpFilters = { page: 1, pageSize: 20 };

const defaultStream: StreamState = {
  isStreaming: false, progress: 0, progressMessage: '', loaded: 0, total: 0,
};

export const useMrpStore = create<MrpState>()(
  (set) => ({
    filters: defaultFilters,
    data: [],
    totalRows: 0,
    stream: defaultStream,

    setFilters: (filters) =>
      set((s) => ({ filters: { ...s.filters, ...filters, page: 1 } })),

    resetFilters: () =>
      set({ filters: defaultFilters, data: [], totalRows: 0, stream: defaultStream }),

    setStreamData: (data, total) =>
      set({ data, totalRows: total, stream: { ...defaultStream, progress: 100 } }),

    setStreamProgress: (pct, message, loaded = 0, total = 0) =>
      set((s) => ({ stream: { ...s.stream, progress: pct, progressMessage: message, loaded, total } })),

    // Чистим старые данные при старте нового стрима
    startStream: () =>
      set({ data: [], totalRows: 0, stream: { ...defaultStream, isStreaming: true } }),

    stopStream: () =>
      set((s) => ({ stream: { ...s.stream, isStreaming: false } })),
  }),
);
