import api from './axios';
import type { User, CreateUserDto, ApiResponse } from '../types';

export const usersApi = {
  getAll: () => api.get<ApiResponse<User[]>>('/users'),

  getOne: (id: string) => api.get<ApiResponse<User>>(`/users/${id}`),

  create: (dto: CreateUserDto) => api.post<ApiResponse<User>>('/users', dto),

  update: (id: string, dto: Partial<CreateUserDto>) =>
    api.patch<ApiResponse<User>>(`/users/${id}`, dto),

  toggleActive: (id: string) =>
    api.patch<ApiResponse<User>>(`/users/${id}/toggle-active`),

  delete: (id: string) => api.delete(`/users/${id}`),
};
