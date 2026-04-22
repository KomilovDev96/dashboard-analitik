import axios from 'axios';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';

NProgress.configure({ showSpinner: false, speed: 300, minimum: 0.08 });

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  timeout: 30000,
});

let activeRequests = 0;

api.interceptors.request.use((config) => {
  activeRequests++;
  NProgress.start();

  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  return config;
});

api.interceptors.response.use(
  (response) => {
    activeRequests--;
    if (activeRequests === 0) NProgress.done();
    return response;
  },
  (error) => {
    activeRequests--;
    if (activeRequests === 0) NProgress.done();

    // Only auto-redirect on 401 for protected routes, NOT for login itself
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default api;
