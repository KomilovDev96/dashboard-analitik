import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntApp } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { useAuthStore } from './stores/authStore';
import { useMrpStore } from './stores/mrpStore';
import AppLayout from './components/Layout/AppLayout';
import LoginPage from './pages/Login';
import PreloadPage from './pages/Preload';
import DashboardPage from './pages/Dashboard';
import UsersPage from './pages/Users';
import ProfilePage from './pages/Profile';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 2 * 60 * 1000 },
  },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isPreloaded = useMrpStore((s) => s.isPreloaded);
  const location = useLocation();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isPreloaded && location.pathname !== '/preload') return <Navigate to="/preload" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  return user?.role === 'super_admin' ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={ruRU}
        theme={{
          token: {
            colorPrimary: '#667eea',
            borderRadius: 8,
            fontFamily: "'Inter', -apple-system, sans-serif",
          },
        }}
      >
        <AntApp>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              {/* Splash preload screen — auth required, no preload check */}
              <Route
                path="/preload"
                element={
                  useAuthStore.getState().isAuthenticated
                    ? <PreloadPage />
                    : <Navigate to="/login" replace />
                }
              />

              <Route
                path="/"
                element={
                  <RequireAuth>
                    <AppLayout />
                  </RequireAuth>
                }
              >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route
                  path="users"
                  element={
                    <RequireAdmin>
                      <UsersPage />
                    </RequireAdmin>
                  }
                />
              </Route>

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
