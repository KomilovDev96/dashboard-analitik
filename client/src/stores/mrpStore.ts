import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
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

  // Preloaded data (all products for latest date)
  preloadedData: MrpRow[];
  preloadedDate: string;   // 'YYYY-MM-DD'
  isPreloaded: boolean;
  preloadStream: StreamState;

  setFilters: (filters: Partial<MrpFilters>) => void;
  resetFilters: () => void;
  setStreamData: (data: MrpRow[], total: number) => void;
  setStreamProgress: (pct: number, message: string, loaded?: number, total?: number) => void;
  startStream: () => void;
  stopStream: () => void;

  setPreloadedData: (data: MrpRow[], date: string) => void;
  setPreloadProgress: (pct: number, message: string, loaded?: number, total?: number) => void;
  startPreloadStream: () => void;
  stopPreloadStream: () => void;

  applyFiltersOnPreloaded: (filters: MrpFilters) => void;
}

const defaultFilters: MrpFilters = { page: 1, pageSize: 20 };

const defaultStream: StreamState = {
  isStreaming: false, progress: 0, progressMessage: '', loaded: 0, total: 0,
};

export const useMrpStore = create<MrpState>()(
  devtools(
    (set, get) => ({
      filters: defaultFilters,
      data: [],
      totalRows: 0,
      stream: defaultStream,

      preloadedData: [],
      preloadedDate: '',
      isPreloaded: false,
      preloadStream: defaultStream,

      setFilters: (filters) =>
        set((s) => ({ filters: { ...s.filters, ...filters, page: 1 } }), false, 'setFilters'),

      resetFilters: () =>
        set({ filters: defaultFilters }, false, 'resetFilters'),

      setStreamData: (data, total) =>
        set({ data, totalRows: total, stream: { ...defaultStream, progress: 100 } }, false, 'setStreamData'),

      setStreamProgress: (pct, message, loaded = 0, total = 0) =>
        set((s) => ({ stream: { ...s.stream, progress: pct, progressMessage: message, loaded, total } }), false, 'setStreamProgress'),

      startStream: () =>
        set({ stream: { ...defaultStream, isStreaming: true } }, false, 'startStream'),

      stopStream: () =>
        set((s) => ({ stream: { ...s.stream, isStreaming: false } }), false, 'stopStream'),

      // ── Preload actions ──────────────────────────────────────────────────────
      setPreloadedData: (data, date) =>
        set({
          preloadedData: data,
          preloadedDate: date,
          isPreloaded: true,
          preloadStream: { ...defaultStream, progress: 100 },
        }, false, 'setPreloadedData'),

      setPreloadProgress: (pct, message, loaded = 0, total = 0) =>
        set((s) => ({ preloadStream: { ...s.preloadStream, progress: pct, progressMessage: message, loaded, total } }), false, 'setPreloadProgress'),

      startPreloadStream: () =>
        set({ preloadStream: { ...defaultStream, isStreaming: true } }, false, 'startPreloadStream'),

      stopPreloadStream: () =>
        set((s) => ({ preloadStream: { ...s.preloadStream, isStreaming: false } }), false, 'stopPreloadStream'),

      // Apply category/warehouse/sku filters on preloaded data (client-side, instant)
      applyFiltersOnPreloaded: (filters) => {
        const { preloadedData } = get();
        let result = preloadedData;

        if (filters.categories?.length) {
          result = result.filter(r => filters.categories!.includes(r.category));
        }
        if (filters.warehouses?.length) {
          result = result.filter(r => filters.warehouses!.includes(r.warehouse));
        }
        if (filters.skus?.length) {
          result = result.filter(r => filters.skus!.includes(r.product_name));
        }

        set({ data: result, totalRows: result.length, stream: { ...defaultStream, progress: 100 } }, false, 'applyFiltersOnPreloaded');
      },
    }),
    { name: 'MrpStore' },
  ),
);
