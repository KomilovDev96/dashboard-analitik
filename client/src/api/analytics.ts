import api from './axios';

export interface AnalyticsRow {
  product_key: string;
  product_name: string;
  sku: string;
  category: string;
  warehouse_key: string;
  warehouse: string;
  balance: number;
  balance_date: string;
  in_transit: number;
  avg_daily_sales: number;
  std_daily_sales: number;
  avg_lt: number;
  std_lt: number;
  lt_count: number;
}

export interface AnalyticsFilters {
  categories: string[];
  warehouses: string[];
}

export const analyticsApi = {
  getMrpData: (params: Record<string, unknown>) =>
    api.get<{ success: boolean; data: AnalyticsRow[] }>('/analytics/mrp', { params }),

  getFilters: () =>
    api.get<{ success: boolean; data: AnalyticsFilters }>('/analytics/filters'),
};
