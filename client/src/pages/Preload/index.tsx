import { useEffect } from 'react';
import { Typography, Progress } from 'antd';
import { useNavigate } from 'react-router-dom';
import { mrpApi } from '../../api/mrp';
import { useMrpStore } from '../../stores/mrpStore';
import type { MrpRow } from '../../types';

const SESSION_KEY = 'mrp_preload';

function saveToSession(data: MrpRow[], date: string) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ data, date, savedAt: Date.now() }));
  } catch { /* quota exceeded — ignore */ }
}

function loadFromSession(): { data: MrpRow[]; date: string } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: MrpRow[]; date: string; savedAt: number };
    // Valid only for current day (86400000 ms = 24h)
    if (Date.now() - parsed.savedAt > 86_400_000) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return { data: parsed.data, date: parsed.date };
  } catch { return null; }
}

const { Text } = Typography;

export default function PreloadPage() {
  const navigate = useNavigate();
  const {
    startPreloadStream, stopPreloadStream,
    setPreloadProgress, setPreloadedData,
    preloadStream,
  } = useMrpStore();

  useEffect(() => {
    // Check sessionStorage first — survives Ctrl+R without hitting server
    const cached = loadFromSession();
    if (cached) {
      setPreloadedData(cached.data, cached.date);
      stopPreloadStream();
      navigate('/dashboard', { replace: true });
      return;
    }

    startPreloadStream();

    const close = mrpApi.streamPreload(
      (event) => {
        setPreloadProgress(event.pct, event.message ?? '', event.loaded, event.total);
      },
      (data, _total, date) => {
        saveToSession(data, date);       // save for next refresh
        setPreloadedData(data, date);
        stopPreloadStream();
        setTimeout(() => navigate('/dashboard', { replace: true }), 500);
      },
      () => {
        stopPreloadStream();
        setTimeout(() => navigate('/dashboard', { replace: true }), 500);
      },
    );

    return () => close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = preloadStream.progress;
  const isDone = pct >= 100;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 32,
    }}>
      <img src="/logo.png" alt="MRP" style={{ height: 90, objectFit: 'contain' }} />

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
          MRP Dashboard
        </div>
        <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
          {isDone ? 'Готово! Переходим...' : 'Загружаем данные склада...'}
        </Text>
      </div>

      <div style={{ width: 380 }}>
        <Progress
          percent={Math.round(pct)}
          strokeColor={isDone ? '#4ade80' : { '0%': '#667eea', '100%': '#764ba2' }}
          railColor="rgba(255,255,255,0.1)"
          status={isDone ? 'success' : 'active'}
          format={(p) => (
            <span style={{ color: isDone ? '#4ade80' : '#a5b4fc', fontWeight: 700, fontSize: 13 }}>
              {p}%
            </span>
          )}
        />

        {preloadStream.total > 0 && (
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
              {preloadStream.loaded.toLocaleString('ru-RU')} / {preloadStream.total.toLocaleString('ru-RU')} записей
            </Text>
          </div>
        )}

        {preloadStream.progressMessage && !isDone && (
          <div style={{ textAlign: 'center', marginTop: 4 }}>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
              {preloadStream.progressMessage}
            </Text>
          </div>
        )}
      </div>

      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
        После загрузки фильтрация будет мгновенной
      </Text>
    </div>
  );
}
