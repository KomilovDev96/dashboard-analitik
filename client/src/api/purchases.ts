import api from './axios';
import type { ApiResponse, SseProgressEvent } from '../types';

export interface PurchasesRow {
  product_name: string;
  level_1: string;
  level_2: string;
  level_3: string;
  level_4: string;
  segment: string;
  manager: string;
  currency: string;
  quantity: number;
  amount: number;
  amount_usd: number;
  order_lines: number;
}

export interface PurchasesFilters {
  dateFrom?: string;
  dateTo?: string;
  segments?: string[];
  categories?: string[];
  managers?: string[];
}

const buildQuery = (filters: PurchasesFilters): string => {
  const p = new URLSearchParams();
  if (filters.dateFrom) p.append('dateFrom', filters.dateFrom);
  if (filters.dateTo) p.append('dateTo', filters.dateTo);
  filters.segments?.forEach((s) => p.append('segments', s));
  filters.categories?.forEach((c) => p.append('categories', c));
  filters.managers?.forEach((m) => p.append('managers', m));
  return p.toString();
};

export const purchasesApi = {
  getSegments:   () => api.get<ApiResponse<string[]>>('/purchases/filters/segments'),
  getCategories: () => api.get<ApiResponse<string[]>>('/purchases/filters/categories'),
  getManagers:   () => api.get<ApiResponse<string[]>>('/purchases/filters/managers'),
  getDateRange:  () => api.get<ApiResponse<{ min: string; max: string }>>('/purchases/filters/date-range'),

  streamReport: (
    filters: PurchasesFilters,
    onProgress: (e: SseProgressEvent) => void,
    onDone: (data: PurchasesRow[], total: number) => void,
    onError: (msg: string) => void,
  ): (() => void) => {
    const token = localStorage.getItem('token');
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    const qs = buildQuery(filters);
    const source = new EventSource(`${base}/purchases/report/stream?${qs}&token=${token}`);

    source.addEventListener('progress', (e) => onProgress(JSON.parse((e as MessageEvent).data)));
    source.addEventListener('done', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { data: PurchasesRow[]; total: number };
      onDone(d.data, d.total);
      source.close();
    });
    source.addEventListener('error', (e) => {
      const msg = (e as MessageEvent).data
        ? (JSON.parse((e as MessageEvent).data) as { message: string }).message
        : 'Stream error';
      onError(msg);
      source.close();
    });

    return () => source.close();
  },
};
