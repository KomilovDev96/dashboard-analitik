import { useState, useRef, useEffect } from 'react';
import {
  Card, Form, Input, Button, Avatar, Typography, Divider,
  Row, Col, Tag, App, Spin,
} from 'antd';
import {
  UserOutlined, CameraOutlined, SaveOutlined,
  LockOutlined, PhoneOutlined, MailOutlined, BankOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../stores/authStore';
import { profileApi } from '../../api/profile';

const { Text, Title } = Typography;

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();
  const [form] = Form.useForm();
  const [pwdForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [avatar, setAvatar] = useState<string | undefined>(user?.avatar);
  const [loadingMe, setLoadingMe] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const { notification } = App.useApp();
  const isSuperAdmin = user?.role === 'super_admin';

  useEffect(() => {
    profileApi.getMe().then((res) => {
      const u = res.data.data;
      updateUser(u);
      setAvatar(u.avatar);
      form.setFieldsValue({
        firstName: u.firstName ?? '',
        lastName: u.lastName ?? '',
        phone: u.phone ?? '',
        email: u.email ?? '',
        position: u.position ?? '',
      });
    }).finally(() => setLoadingMe(false));
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      notification.warning({ message: 'Файл слишком большой. Максимум 2MB', duration: 3 });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setAvatar(result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (values: Record<string, string>) => {
    setSaving(true);
    try {
      const payload: Record<string, string | null> = { ...values };
      if (avatar !== user?.avatar) payload.avatar = avatar ?? null;
      const res = await profileApi.update(payload);
      updateUser({ ...user!, ...res.data.data });
      notification.success({ message: 'Профиль сохранён', duration: 2 });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      notification.error({ message: msg ?? 'Ошибка сохранения', duration: 4 });
    } finally {
      setSaving(false);
    }
  };

  const handleSavePassword = async (values: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
    if (values.newPassword !== values.confirmPassword) {
      notification.error({ message: 'Пароли не совпадают', duration: 3 });
      return;
    }
    setSavingPwd(true);
    try {
      await profileApi.update({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      pwdForm.resetFields();
      notification.success({ message: 'Пароль изменён', duration: 2 });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      notification.error({ message: msg ?? 'Ошибка смены пароля', duration: 4 });
    } finally {
      setSavingPwd(false);
    }
  };

  if (loadingMe) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        borderRadius: 16,
        padding: '20px 28px',
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'rgba(99,102,241,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, flexShrink: 0,
        }}>
          <UserOutlined style={{ color: '#a5b4fc' }} />
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Настройки профиля</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
            {user?.firstName && user?.lastName
              ? `${user.firstName} ${user.lastName}`
              : user?.name}
            &nbsp;·&nbsp;
            <Tag color={isSuperAdmin ? 'purple' : 'blue'} style={{ fontSize: 11, margin: 0 }}>
              {isSuperAdmin ? 'Super Admin' : 'Client'}
            </Tag>
          </div>
        </div>
      </div>

      <Row gutter={24}>
        {/* Left — avatar */}
        <Col xs={24} sm={8}>
          <Card
            style={{ borderRadius: 14, textAlign: 'center', border: '1px solid #ebebf0' }}
            styles={{ body: { padding: '32px 20px' } }}
          >
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <Avatar
                size={110}
                src={avatar}
                icon={!avatar && <UserOutlined />}
                style={{
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  fontSize: 44,
                  cursor: 'pointer',
                  border: '3px solid #f0f0f0',
                }}
                onClick={() => fileRef.current?.click()}
              />
              <div
                onClick={() => fileRef.current?.click()}
                style={{
                  position: 'absolute', bottom: 4, right: 4,
                  width: 30, height: 30, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                }}
              >
                <CameraOutlined style={{ color: '#fff', fontSize: 14 }} />
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleAvatarChange}
              />
            </div>

            <div style={{ marginTop: 16 }}>
              <Text strong style={{ fontSize: 15, display: 'block' }}>
                {user?.firstName && user?.lastName
                  ? `${user.firstName} ${user.lastName}`
                  : user?.name}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>{user?.email}</Text>
              {user?.position && (
                <div style={{ marginTop: 6 }}>
                  <Tag color="geekblue" style={{ fontSize: 11 }}>{user.position}</Tag>
                </div>
              )}
            </div>

            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 12 }}>
              JPG, PNG · до 2MB
            </Text>

            {avatar && (
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => setAvatar(undefined)}
                style={{ marginTop: 10, borderRadius: 6 }}
              >
                Удалить фото
              </Button>
            )}
          </Card>
        </Col>

        {/* Right — form */}
        <Col xs={24} sm={16}>
          <Card
            title={<Text strong style={{ fontSize: 14 }}>Личные данные</Text>}
            style={{ borderRadius: 14, border: '1px solid #ebebf0', marginBottom: 20 }}
            styles={{ body: { padding: '20px 24px' } }}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSaveProfile}
              size="middle"
            >
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="Имя" name="firstName">
                    <Input prefix={<UserOutlined style={{ color: '#bbb' }} />} placeholder="Имя" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Фамилия" name="lastName">
                    <Input prefix={<UserOutlined style={{ color: '#bbb' }} />} placeholder="Фамилия" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="Номер телефона" name="phone">
                <Input prefix={<PhoneOutlined style={{ color: '#bbb' }} />} placeholder="+998 90 123 45 67" />
              </Form.Item>

              <Form.Item
                label="Email"
                name="email"
                rules={[{ type: 'email', message: 'Неверный формат email' }]}
              >
                <Input
                  prefix={<MailOutlined style={{ color: '#bbb' }} />}
                  placeholder="email@example.com"
                  disabled={!isSuperAdmin}
                />
              </Form.Item>

              {isSuperAdmin && (
                <Form.Item label="Должность" name="position">
                  <Input prefix={<BankOutlined style={{ color: '#bbb' }} />} placeholder="Руководитель отдела закупок" />
                </Form.Item>
              )}

              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={saving}
                style={{
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                }}
              >
                Сохранить
              </Button>
            </Form>
          </Card>

          {/* Password section */}
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <LockOutlined style={{ color: '#667eea' }} />
                <Text strong style={{ fontSize: 14 }}>Изменить пароль</Text>
              </div>
            }
            style={{ borderRadius: 14, border: '1px solid #ebebf0' }}
            styles={{ body: { padding: '20px 24px' } }}
          >
            <Form
              form={pwdForm}
              layout="vertical"
              onFinish={handleSavePassword}
              size="middle"
            >
              <Form.Item
                label="Текущий пароль"
                name="currentPassword"
                rules={[{ required: true, message: 'Введите текущий пароль' }]}
              >
                <Input.Password prefix={<LockOutlined style={{ color: '#bbb' }} />} placeholder="Текущий пароль" />
              </Form.Item>

              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item
                    label="Новый пароль"
                    name="newPassword"
                    rules={[{ required: true, min: 6, message: 'Минимум 6 символов' }]}
                  >
                    <Input.Password prefix={<LockOutlined style={{ color: '#bbb' }} />} placeholder="Новый пароль" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    label="Подтвердить пароль"
                    name="confirmPassword"
                    rules={[{ required: true, message: 'Повторите пароль' }]}
                  >
                    <Input.Password prefix={<LockOutlined style={{ color: '#bbb' }} />} placeholder="Повторите пароль" />
                  </Form.Item>
                </Col>
              </Row>

              <Button
                type="primary"
                htmlType="submit"
                icon={<LockOutlined />}
                loading={savingPwd}
                style={{
                  background: 'linear-gradient(135deg, #f43f5e, #ec4899)',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                }}
              >
                Изменить пароль
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
