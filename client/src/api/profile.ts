import api from './axios';
import type { ApiResponse, User } from '../types';

export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  position?: string;
  avatar?: string;
  currentPassword?: string;
  newPassword?: string;
}

export const profileApi = {
  getMe: () => api.get<ApiResponse<User>>('/auth/me'),
  update: (data: UpdateProfilePayload) =>
    api.patch<ApiResponse<User>>('/auth/profile', data),
};
