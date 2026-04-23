import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Typography, Tooltip, App } from 'antd';
import { SyncOutlined, CheckCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import MrpFilters from '../../components/MrpTable/MrpFilters';
import MrpDataTable from '../../components/MrpTable/MrpDataTable';
import { mrpApi } from '../../api/mrp';

const { Text } = Typography;

function LastUpdateBadge() {
  const [checking, setChecking] = useState(false);
  const qc = useQueryClient();
  const { notification } = App.useApp();

  const { data, isLoading } = useQuery({
    queryKey: ['mrp-last-update'],
    queryFn: async () => {
      const r = await mrpApi.getLastUpdate();
      return r.data.data;
    },
    staleTime: 60 * 1000,
  });

  const isToday = data?.isToday ?? false;
  const daysAgo = data?.daysAgo ?? 0;

  const label = isLoading
    ? 'загрузка...'
    : data?.lastUpdate
      ? dayjs(data.lastUpdate).format('DD.MM.YYYY')
      : '—';

  const subLabel = !isLoading && data && !isToday && daysAgo > 0
    ? daysAgo === 1 ? 'вчера' : `${daysAgo} дн. назад`
    : null;

  const handleCheck = async () => {
    setChecking(true);
    try {
      const res = await mrpApi.checkSync();
      const result = res.data.data;

      if (result.updated) {
        notification.success({
          message: 'Найдено обновление!',
          description: `Данные обновлены: ${result.prevDate || '—'} → ${result.newDate}. Кэш очищен. Перезагрузите страницу.`,
          duration: 8,
        });
        qc.invalidateQueries({ queryKey: ['mrp-last-update'] });
      } else {
        notification.info({
          message: 'Обновлений нет',
          description: `Последние данные: ${result.newDate}`,
          duration: 4,
        });
      }
    } catch {
      notification.error({ message: 'Ошибка проверки обновлений', duration: 4 });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: (isToday || daysAgo === 0) ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)',
        border: `1px solid ${(isToday || daysAgo === 0) ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.15)'}`,
        borderRadius: 20,
        padding: '6px 14px',
        flexShrink: 0,
      }}>
        {isLoading ? (
          <SyncOutlined spin style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }} />
        ) : (isToday || daysAgo === 0) ? (
          <CheckCircleOutlined style={{ color: '#4ade80', fontSize: 13 }} />
        ) : (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316', flexShrink: 0 }} />
        )}
        <div>
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', display: 'block', lineHeight: 1.2 }}>
            Последнее обновление
          </Text>
          <Text style={{
            fontSize: 12, fontWeight: 700,
            color: isLoading ? 'rgba(255,255,255,0.3)' : (isToday || daysAgo === 0) ? '#4ade80' : '#fb923c',
            display: 'block', lineHeight: 1.3,
          }}>
            {isLoading ? 'загрузка...' : (isToday || daysAgo === 0) ? 'Сегодня обновился' : label}
            {!isToday && subLabel && (
              <span style={{ fontWeight: 400, marginLeft: 4, fontSize: 11 }}>({subLabel})</span>
            )}
          </Text>
        </div>
      </div>

      <Tooltip title="Проверить обновления в ClickHouse">
        <button
          onClick={handleCheck}
          disabled={checking}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 20,
            padding: '6px 12px',
            cursor: checking ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: 'rgba(255,255,255,0.7)',
            fontSize: 12,
            transition: 'all 0.2s',
            opacity: checking ? 0.6 : 1,
          }}
          onMouseEnter={e => !checking && ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.14)')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)')}
        >
          <SyncOutlined spin={checking} style={{ fontSize: 12 }} />
          {checking ? 'Проверяем...' : 'Проверить'}
        </button>
      </Tooltip>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <App>
      <div style={{ padding: 'clamp(12px, 2vw, 24px) clamp(12px, 2vw, 24px)', height: '100%', boxSizing: 'border-box' }}>
        {/* Page header */}
        <div style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          borderRadius: 16,
          padding: '16px clamp(16px, 2vw, 28px)',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <img
            src="/logo.png"
            alt="MRP"
            style={{ height: 48, width: 48, objectFit: 'contain', flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
              MRP Отчёт
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
              Остатки номенклатуры на складах
            </div>
          </div>

          <LastUpdateBadge />
        </div>

        <MrpFilters />
        <MrpDataTable />
      </div>
    </App>
  );
}
