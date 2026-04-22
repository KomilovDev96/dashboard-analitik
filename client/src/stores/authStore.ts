import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set) => ({
        user: null,
        token: null,
        isAuthenticated: false,

        setAuth: (user, token) => {
          localStorage.setItem('token', token);
          set({ user, token, isAuthenticated: true }, false, 'setAuth');
        },

        logout: () => {
          localStorage.removeItem('token');
          set({ user: null, token: null, isAuthenticated: false }, false, 'logout');
        },

        updateUser: (user) => set({ user }, false, 'updateUser'),
      }),
      {
        name: 'auth-storage',
        partialize: (state) => ({ user: state.user, token: state.token, isAuthenticated: state.isAuthenticated }),
      },
    ),
    { name: 'AuthStore' },
  ),
);
