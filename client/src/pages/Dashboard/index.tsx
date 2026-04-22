import { useQuery } from '@tanstack/react-query';
import { Typography } from 'antd';
import { SyncOutlined, CheckCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import MrpFilters from '../../components/MrpTable/MrpFilters';
import MrpDataTable from '../../components/MrpTable/MrpDataTable';
import { mrpApi } from '../../api/mrp';

const { Text } = Typography;

function LastUpdateBadge() {
  const { data, isLoading } = useQuery({
    queryKey: ['mrp-last-update'],
    queryFn: async () => {
      const r = await mrpApi.getLastUpdate();
      return r.data.data;
    },
    staleTime: 60 * 1000, // 1 min
  });

  const isToday = data?.isToday ?? false;
  const daysAgo = data?.daysAgo ?? 0;

  const label = isLoading
    ? 'загрузка...'
    : data?.lastUpdate
      ? dayjs(data.lastUpdate).format('DD.MM.YYYY')
      : '—';

  const subLabel = !isLoading && data && !isToday
    ? daysAgo === 1 ? 'вчера' : `${daysAgo} дн. назад`
    : null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: isToday ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)',
      border: `1px solid ${isToday ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.15)'}`,
      borderRadius: 20,
      padding: '6px 14px',
      flexShrink: 0,
    }}>
      {isLoading ? (
        <SyncOutlined spin style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }} />
      ) : isToday ? (
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
          color: isLoading ? 'rgba(255,255,255,0.3)' : isToday ? '#4ade80' : '#fb923c',
          display: 'block', lineHeight: 1.3,
        }}>
          {label}
          {subLabel && (
            <span style={{ fontWeight: 400, marginLeft: 4, fontSize: 11 }}>({subLabel})</span>
          )}
        </Text>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1600, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        borderRadius: 16,
        padding: '20px 28px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        <img
          src="/logo.png"
          alt="MRP"
          style={{ height: 52, width: 52, objectFit: 'contain', flexShrink: 0 }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
            MRP Отчёт
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
            Остатки номенклатуры на складах в реальном времени
          </div>
        </div>

        <LastUpdateBadge />
      </div>

      <MrpFilters />
      <MrpDataTable />
    </div>
  );
}
