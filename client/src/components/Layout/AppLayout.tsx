import { useState, useEffect } from 'react';
import { Layout, Menu, Avatar, Dropdown, Typography, Space, Tag, Progress } from 'antd';
import {
  BarChartOutlined,
  LineChartOutlined,
  TeamOutlined,
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useMrpStore } from '../../stores/mrpStore';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

function HeaderProgressBar() {
  const stream = useMrpStore((s) => s.stream);
  const [visible, setVisible] = useState(false);

  const isDone = stream.progress >= 100;

  useEffect(() => {
    if (stream.isStreaming || (stream.progress > 0 && !isDone)) {
      setVisible(true);
    }
    if (isDone) {
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(t);
    }
    if (!stream.isStreaming && stream.progress === 0) {
      setVisible(false);
    }
  }, [stream.isStreaming, stream.progress, isDone]);

  if (!visible) return null;

  return (
    <div
      style={{
        height: 36,
        background: isDone
          ? 'linear-gradient(135deg, #f6ffed, #d9f7be)'
          : 'linear-gradient(135deg, #f0f2ff, #e8e4ff)',
        borderTop: `1px solid ${isDone ? '#b7eb8f' : '#d0cafe'}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: 12,
        zIndex: 10,
      }}
    >
      {/* Icon */}
      {isDone ? (
        <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />
      ) : (
        <LoadingOutlined style={{ color: '#667eea', fontSize: 14 }} spin />
      )}

      {/* Label */}
      <Text style={{ fontSize: 12, color: isDone ? '#389e0d' : '#5b4fcf', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {isDone ? 'Загрузка завершена' : 'Загрузка данных...'}
      </Text>

      {/* Counts */}
      {stream.total > 0 && (
        <Text style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>
          {stream.loaded.toLocaleString('ru-RU')} / {stream.total.toLocaleString('ru-RU')} записей
        </Text>
      )}

      {/* Progress bar */}
      <div style={{ flex: 1, maxWidth: 400 }}>
        <Progress
          percent={stream.progress}
          size="small"
          strokeColor={isDone
            ? '#52c41a'
            : { '0%': '#667eea', '100%': '#764ba2' }
          }
          trailColor={isDone ? '#d9f7be' : '#e0dcff'}
          status={isDone ? 'success' : 'active'}
          format={(pct) => (
            <span style={{ fontSize: 11, fontWeight: 700, color: isDone ? '#389e0d' : '#5b4fcf' }}>
              {pct}%
            </span>
          )}
          style={{ marginBottom: 0 }}
        />
      </div>

      {/* Message */}
      {stream.progressMessage && !isDone && (
        <Text style={{ fontSize: 11, color: '#999', whiteSpace: 'nowrap' }}>
          {stream.progressMessage}
        </Text>
      )}
    </div>
  );
}

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';
  const isStreaming = useMrpStore((s) => s.stream.isStreaming);
  const progress = useMrpStore((s) => s.stream.progress);
  const showBar = isStreaming || (progress > 0 && progress <= 100);

  const menuItems = [
    { key: '/dashboard', icon: <BarChartOutlined />, label: 'MRP Отчёт' },
    ...(isSuperAdmin
      ? [{ key: '/users', icon: <TeamOutlined />, label: 'Пользователи' }]
      : []),
  ];

  const userMenu = [
    {
      key: 'profile',
      icon: <SettingOutlined />,
      label: 'Настройки профиля',
      onClick: () => navigate('/profile'),
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Выйти',
      danger: true,
      onClick: () => { logout(); navigate('/login'); },
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        trigger={null}
        width={220}
        style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)' }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 12px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}
        >
          {collapsed ? (
            <img src="/logo.png" alt="MRP" style={{ height: 44, width: 44, objectFit: 'contain' }} />
          ) : (
            <img src="/logo.png" alt="MRP Dashboard" style={{ height: 56, objectFit: 'contain', maxWidth: '100%' }} />
          )}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ background: 'transparent', borderRight: 0, marginTop: 8 }}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
            height: 64,
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <div
            style={{ cursor: 'pointer', fontSize: 18, color: '#666' }}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </div>

          <img
            src="/logo.png"
            alt="MRP Dashboard"
            style={{
              height: 40,
              objectFit: 'contain',
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
            }}
          />

          <Dropdown menu={{ items: userMenu }} placement="bottomRight" arrow>
            <Space style={{ cursor: 'pointer' }}>
              <Avatar
                size={34}
                src={user?.avatar}
                style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}
                icon={!user?.avatar && <UserOutlined />}
              />
              <div style={{ lineHeight: 1.3 }}>
                <Text strong style={{ fontSize: 13, display: 'block' }}>{user?.name}</Text>
                <Tag
                  color={isSuperAdmin ? 'purple' : 'blue'}
                  style={{ fontSize: 10, lineHeight: '16px', margin: 0 }}
                >
                  {isSuperAdmin ? 'Super Admin' : 'Client'}
                </Tag>
              </div>
            </Space>
          </Dropdown>
        </Header>

        <HeaderProgressBar />

        <Content
          style={{
            background: '#f0f2f7',
            minHeight: `calc(100vh - ${showBar ? 100 : 64}px)`,
            transition: 'min-height 0.3s',
            overflow: 'auto',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
