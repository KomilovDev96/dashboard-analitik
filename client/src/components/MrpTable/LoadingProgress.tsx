import { Progress, Typography, Space } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { useMrpStore } from '../../stores/mrpStore';

const { Text } = Typography;

export default function LoadingProgress() {
  const { stream } = useMrpStore();

  if (!stream.isStreaming && stream.progress === 0) return null;

  const isDone = stream.progress >= 100;
  const color =
    stream.progress < 30
      ? '#ff4d4f'
      : stream.progress < 70
        ? '#faad14'
        : '#52c41a';

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 12,
        padding: '16px 24px',
        marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        border: `1px solid ${color}30`,
      }}
    >
      <Space align="center" style={{ marginBottom: 8 }}>
        {!isDone && <LoadingOutlined style={{ color, fontSize: 16 }} spin />}
        <Text strong style={{ fontSize: 14 }}>
          {isDone ? '✅ Загрузка завершена' : 'Загрузка данных...'}
        </Text>
        {stream.total > 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {stream.loaded.toLocaleString()} / {stream.total.toLocaleString()} записей
          </Text>
        )}
      </Space>

      <Progress
        percent={stream.progress}
        strokeColor={{
          '0%': '#667eea',
          '100%': isDone ? '#52c41a' : '#764ba2',
        }}
        trailColor="#f0f0f0"
        strokeWidth={8}
        status={isDone ? 'success' : 'active'}
        format={(pct) => (
          <span style={{ fontSize: 12, fontWeight: 600 }}>{pct}%</span>
        )}
      />

      {stream.progressMessage && !isDone && (
        <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
          {stream.progressMessage}
        </Text>
      )}
    </div>
  );
}
