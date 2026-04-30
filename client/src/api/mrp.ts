import api from './axios';
import type { MrpReport, MrpFilters, MrpRow, SseProgressEvent, ApiResponse } from '../types';

const buildQuery = (filters: MrpFilters): string => {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.append('dateTo', filters.dateTo);
  filters.categories?.forEach((c) => params.append('categories', c));
  filters.warehouses?.forEach((w) => params.append('warehouses', w));
  filters.skus?.forEach((s) => params.append('skus', s));
  if (filters.page) params.append('page', String(filters.page));
  if (filters.pageSize) params.append('pageSize', String(filters.pageSize));
  return params.toString();
};

export const mrpApi = {
  getCategories: () =>
    api.get<ApiResponse<string[]>>('/mrp/filters/categories'),

  getWarehouses: () =>
    api.get<ApiResponse<string[]>>('/mrp/filters/warehouses'),

  getDateRange: () =>
    api.get<ApiResponse<{ min: string; max: string }>>('/mrp/filters/date-range'),

  getLastUpdate: () =>
    api.get<ApiResponse<{ lastUpdate: string; serverDate: string; isToday: boolean; daysAgo: number }>>('/mrp/filters/last-update'),

  checkSync: () =>
    api.get<ApiResponse<{ updated: boolean; prevDate: string; newDate: string; message: string }>>('/sync/check'),

  getReport: (filters: MrpFilters) =>
    api.get<ApiResponse<MrpReport>>(`/mrp/report?${buildQuery(filters)}`),

  streamPreload: (
    onProgress: (event: SseProgressEvent) => void,
    onDone: (data: MrpRow[], total: number, date: string) => void,
    onError: (msg: string) => void,
  ): (() => void) => {
    const token = localStorage.getItem('token');
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    const source = new EventSource(`${base}/mrp/preload/stream?token=${token}`);

    source.addEventListener('progress', (e) => {
      onProgress(JSON.parse(e.data) as SseProgressEvent);
    });
    source.addEventListener('done', (e) => {
      const parsed = JSON.parse(e.data) as { data: MrpRow[]; total: number; date: string };
      onDone(parsed.data, parsed.total, parsed.date);
      source.close();
    });
    source.addEventListener('error', (e) => {
      const msg = (e as MessageEvent).data
        ? (JSON.parse((e as MessageEvent).data) as { message: string }).message
        : 'Preload error';
      onError(msg);
      source.close();
    });

    return () => source.close();
  },

  getProductMonthlySales: (productId: string) =>
    api.get<ApiResponse<{ month: string; sales: number }[]>>(`/mrp/monthly-sales?productId=${productId}`),

  streamReport: (
    filters: MrpFilters,
    onProgress: (event: SseProgressEvent) => void,
    onDone: (data: MrpRow[], total: number) => void,
    onError: (msg: string) => void,
  ): (() => void) => {
    const token = localStorage.getItem('token');
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    const qs = buildQuery(filters);
    const url = `${base}/mrp/report/stream?${qs}`;

    const source = new EventSource(`${url}&token=${token}`);

    source.addEventListener('progress', (e) => {
      onProgress(JSON.parse(e.data) as SseProgressEvent);
    });

    source.addEventListener('done', (e) => {
      const parsed = JSON.parse(e.data) as { data: MrpRow[]; total: number };
      onDone(parsed.data, parsed.total);
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
