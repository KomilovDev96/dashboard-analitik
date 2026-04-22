import { useState } from 'react';
import {
  Table, Button, Tag, Modal, Form, Input, Select, Space,
  Typography, Popconfirm, message, Card,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, StopOutlined, CheckOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../../api/users';
import type { User, CreateUserDto } from '../../types';

const { Title } = Typography;

export default function UsersPage() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form] = Form.useForm();

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.getAll().then((r) => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (dto: CreateUserDto) => usersApi.create(dto),
    onSuccess: () => {
      message.success('Пользователь создан');
      qc.invalidateQueries({ queryKey: ['users'] });
      closeModal();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      message.error(e.response?.data?.message ?? 'Ошибка');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<CreateUserDto> }) =>
      usersApi.update(id, dto),
    onSuccess: () => {
      message.success('Обновлено');
      qc.invalidateQueries({ queryKey: ['users'] });
      closeModal();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => usersApi.toggleActive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      message.success('Удалён');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    form.setFieldsValue({ name: user.name, email: user.email, role: user.role, company: user.company, phone: user.phone });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const handleSubmit = (values: CreateUserDto) => {
    if (editing) {
      updateMutation.mutate({ id: editing._id, dto: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const columns = [
    { title: 'Имя', dataIndex: 'name', key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Роль',
      dataIndex: 'role',
      render: (r: string) => (
        <Tag color={r === 'super_admin' ? 'purple' : 'blue'}>
          {r === 'super_admin' ? 'Super Admin' : 'Client'}
        </Tag>
      ),
    },
    { title: 'Компания', dataIndex: 'company', render: (v: string) => v || '—' },
    {
      title: 'Статус',
      dataIndex: 'isActive',
      render: (v: boolean) => (
        <Tag color={v ? 'green' : 'red'}>{v ? 'Активен' : 'Отключён'}</Tag>
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      render: (_: unknown, record: User) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Button
            size="small"
            icon={record.isActive ? <StopOutlined /> : <CheckOutlined />}
            onClick={() => toggleMutation.mutate(record._id)}
            danger={record.isActive}
          />
          <Popconfirm
            title="Удалить пользователя?"
            onConfirm={() => deleteMutation.mutate(record._id)}
          >
            <Button size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          👥 Управление пользователями
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreate}
          style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)', border: 'none', borderRadius: 8 }}
        >
          Добавить
        </Button>
      </div>

      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        <Table
          dataSource={users ?? []}
          columns={columns}
          rowKey="_id"
          loading={isLoading}
          size="small"
          pagination={{ pageSize: 20, showTotal: (t) => `${t} пользователей` }}
        />
      </Card>

      <Modal
        title={editing ? 'Редактировать пользователя' : 'Новый пользователь'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        okText={editing ? 'Сохранить' : 'Создать'}
        cancelText="Отмена"
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Имя" rules={[{ required: true }]}>
            <Input placeholder="Иван Иванов" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="email@example.com" />
          </Form.Item>
          {!editing && (
            <Form.Item name="password" label="Пароль" rules={[{ required: true, min: 6 }]}>
              <Input.Password placeholder="Минимум 6 символов" />
            </Form.Item>
          )}
          <Form.Item name="role" label="Роль" initialValue="client">
            <Select options={[{ value: 'client', label: 'Client' }, { value: 'super_admin', label: 'Super Admin' }]} />
          </Form.Item>
          <Form.Item name="company" label="Компания">
            <Input placeholder="Название компании" />
          </Form.Item>
          <Form.Item name="phone" label="Телефон">
            <Input placeholder="+998901234567" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
