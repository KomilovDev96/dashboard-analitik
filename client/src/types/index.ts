export interface User {
  _id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'client';
  isActive: boolean;
  company?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  avatar?: string;
  createdAt: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

export interface MrpRow {
  product_name: string;
  category: string;   // = level_1 (backward compat)
  level_1: string;
  level_2: string;
  level_3: string;
  level_4: string;
  warehouse: string;
  balance: number;
  balance_date?: string;
}

export interface MrpReport {
  data: MrpRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface MrpFilters {
  dateFrom?: string;
  dateTo?: string;
  categories?: string[];
  warehouses?: string[];
  skus?: string[];
  page?: number;
  pageSize?: number;
}

export interface SseProgressEvent {
  pct: number;
  loaded?: number;
  total?: number;
  message?: string;
}

export interface CreateUserDto {
  name: string;
  email: string;
  password: string;
  role?: 'super_admin' | 'client';
  company?: string;
  phone?: string;
}
