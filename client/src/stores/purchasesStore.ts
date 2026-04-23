import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { PurchasesRow, PurchasesFilters } from '../api/purchases';

interface StreamState {
  isStreaming: boolean;
  progress: number;
  message: string;
  loaded: number;
  total: number;
}

interface PurchasesState {
  filters: PurchasesFilters;
  data: PurchasesRow[];
  totalRows: number;
  stream: StreamState;
  lastDate: string; // последняя дата из БД

  setFilters: (f: Partial<PurchasesFilters>) => void;
  resetFilters: () => void;
  setLastDate: (date: string) => void;
  startStream: () => void;
  stopStream: () => void;
  setProgress: (pct: number, msg: string, loaded?: number, total?: number) => void;
  setData: (data: PurchasesRow[], total: number) => void;
}

const defaultStream: StreamState = { isStreaming: false, progress: 0, message: '', loaded: 0, total: 0 };

export const usePurchasesStore = create<PurchasesState>()(
  devtools(
    (set, get) => ({
      filters: {},
      data: [],
      totalRows: 0,
      stream: defaultStream,
      lastDate: '',

      setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } }), false, 'setFilters'),

      resetFilters: () => {
        const { lastDate } = get();
        set({
          filters: lastDate ? { dateFrom: lastDate, dateTo: lastDate } : {},
          data: [],
          totalRows: 0,
          stream: defaultStream,
        }, false, 'resetFilters');
      },

      setLastDate: (date) => set({ lastDate: date }, false, 'setLastDate'),

      startStream: () => set({ stream: { ...defaultStream, isStreaming: true } }, false, 'startStream'),
      stopStream: () => set((s) => ({ stream: { ...s.stream, isStreaming: false } }), false, 'stopStream'),
      setProgress: (pct, msg, loaded = 0, total = 0) =>
        set((s) => ({ stream: { ...s.stream, progress: pct, message: msg, loaded, total } }), false, 'setProgress'),
      setData: (data, total) =>
        set({ data, totalRows: total, stream: { ...defaultStream, progress: 100 } }, false, 'setData'),
    }),
    { name: 'PurchasesStore' },
  ),
);
