import { useState } from 'react';
import { Form, Input, Button, Card, Typography, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../stores/authStore';

const { Title, Text } = Typography;

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);
  const { notification } = App.useApp();

  const onFinish = async (values: LoginForm) => {
    setLoading(true);
    try {
      const res = await authApi.login(values.email, values.password);
      const { user, token } = res.data.data;
      setAuth(user, token);

      notification.success({
        message: 'Добро пожаловать!',
        description: `Вы вошли как ${user.name}`,
        placement: 'topRight',
        duration: 2,
      });

      setTimeout(() => navigate('/preload'), 600);
    } catch (err: unknown) {
      const raw =
        (err as { response?: { data?: { message?: string | string[] } } })
          ?.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join(', ') : (raw ?? 'Неверный логин или пароль');

      notification.error({
        message: 'Ошибка входа',
        description: msg,
        placement: 'topRight',
        duration: 4,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      }}
    >
      <Card
        style={{
          width: 420,
          borderRadius: 16,
          boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
        }}
        styles={{ body: { padding: '40px 40px 32px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/logo.png"
            alt="MRP Dashboard"
            style={{ height: 80, objectFit: 'contain', marginBottom: 8 }}
          />
          <Text type="secondary" style={{ display: 'block' }}>Войдите в систему</Text>
        </div>

        <Form layout="vertical" onFinish={onFinish} size="large">
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'Введите email' },
              { type: 'email', message: 'Неверный формат email' },
            ]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#bbb' }} />}
              placeholder="Email"
              autoComplete="email"
              disabled={loading}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Введите пароль' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bbb' }} />}
              placeholder="Пароль"
              autoComplete="current-password"
              disabled={loading}
            />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            block
            style={{
              height: 44,
              borderRadius: 8,
              background: loading
                ? undefined
                : 'linear-gradient(135deg, #667eea, #764ba2)',
              border: 'none',
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {loading ? 'Входим...' : 'Войти'}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
