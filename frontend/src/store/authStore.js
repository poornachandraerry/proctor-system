import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../utils/api';

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/auth/login', { email, password });
          api.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
          set({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken, isAuthenticated: true, isLoading: false });
          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          return { success: false, error: error.response?.data?.error || 'Login failed' };
        }
      },

      register: async (userData) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/auth/register', userData);
          api.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
          set({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken, isAuthenticated: true, isLoading: false });
          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          return { success: false, error: error.response?.data?.error || 'Registration failed' };
        }
      },

      logout: () => {
        delete api.defaults.headers.common['Authorization'];
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },

      setToken: (token) => {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        set({ accessToken: token });
      },

      refreshAuth: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return false;
        try {
          const { data } = await api.post('/auth/refresh', { refreshToken });
          api.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
          set({ accessToken: data.accessToken });
          return true;
        } catch { get().logout(); return false; }
      }
    }),
    { name: 'proctorai-auth', partialize: (state) => ({ user: state.user, accessToken: state.accessToken, refreshToken: state.refreshToken, isAuthenticated: state.isAuthenticated }) }
  )
);

export default useAuthStore;
