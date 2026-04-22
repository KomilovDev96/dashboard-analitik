import { useState, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Select,
  DatePicker,
  Table,
  Tag,
  Spin,
  Empty,
  Typography,
  Space,
  Statistic,
} from 'antd';
import {
  BarChartOutlined,
  ReloadOutlined,
  ClearOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/ru';
import type { ColumnsType } from 'antd/es/table';
import { analyticsApi } from '../../api/analytics';
import type { AnalyticsRow } from '../../api/analytics';

dayjs.locale('ru');

const { Text } = Typography;

// ─── Status colour tokens ─────────────────────────────────────────────────────
const STATUS_COLORS = {
  КРИТИЧНО: '#ff4d4f',
  'НУЖЕН ЗАКАЗ': '#fa8c16',
  ОКЕЙ: '#52c41a',
} as const;

type Status = keyof typeof STATUS_COLORS;

// ─── Computed MRP fields ──────────────────────────────────────────────────────
interface ComputedRow extends AnalyticsRow {
  V_d: number;
  V_lt: number;
  OIL: number;
  RL: number;
  SS: number;
  SL: number;
  status: Status;
  order_qty: number;
  moq: number;
  кратность: number;
}

function computeMrp(row: AnalyticsRow, moq = 1, кратность = 1): ComputedRow {
  const V_d =
    row.avg_daily_sales > 0 ? row.std_daily_sales / row.avg_daily_sales : 0;
  const V_lt = row.avg_lt > 0 ? row.std_lt / row.avg_lt : 0;
  const OIL = row.avg_lt * (1 + V_lt) * (1 + V_d);
  const RL = Math.round(row.avg_daily_sales * OIL);
  const SS = Math.round(
    row.avg_daily_sales * row.avg_lt * V_d +
      row.avg_daily_sales * row.avg_lt * V_lt +
      row.avg_daily_sales * row.avg_lt * V_d * V_lt,
  );
  const SL = row.balance + row.in_transit;

  let status: Status;
  if (SL <= SS) status = 'КРИТИЧНО';
  else if (SL <= RL) status = 'НУЖЕН ЗАКАЗ';
  else status = 'ОКЕЙ';

  let order_qty = 0;
  if (status !== 'ОКЕЙ') {
    const raw = RL - SL;
    if (кратность > 1) {
      order_qty = Math.ceil(raw / кратность) * кратность;
    } else {
      order_qty = Math.max(raw, moq);
    }
    order_qty = Math.max(order_qty, moq);
  }

  return { ...row, V_d, V_lt, OIL, RL, SS, SL, status, order_qty, moq, кратность };
}

// ─── Table row types ───────────────────────────────────────────────────────────
interface WarehouseTableRow extends ComputedRow {
  key: string;
  rowType: 'warehouse';
}

interface ProductTableRow {
  key: string;
  rowType: 'product';
  product_key: string;
  product_name: string;
  sku: string;
  category: string;
  // aggregated
  balance: number;
  in_transit: number;
  SL: number;
  avg_daily_sales: number;
  avg_lt: number;
  SS: number;
  RL: number;
  status: Status;
  order_qty: number;
  children: WarehouseTableRow[];
}

interface CategoryTableRow {
  key: string;
  rowType: 'category';
  category: string;
  balance: number;
  in_transit: number;
  SL: number;
  avg_daily_sales: number;
  avg_lt: number;
  SS: number;
  RL: number;
  status: Status;
  order_qty: number;
  children: ProductTableRow[];
}

type AnyTableRow = CategoryTableRow | ProductTableRow | WarehouseTableRow;

// ─── Dominant status helper ───────────────────────────────────────────────────
function dominantStatus(statuses: Status[]): Status {
  if (statuses.includes('КРИТИЧНО')) return 'КРИТИЧНО';
  if (statuses.includes('НУЖЕН ЗАКАЗ')) return 'НУЖЕН ЗАКАЗ';
  return 'ОКЕЙ';
}

// ─── Build grouped table data ─────────────────────────────────────────────────
function buildTableData(computed: ComputedRow[]): CategoryTableRow[] {
  // group by category → product_key → warehouse rows
  const catMap = new Map<string, Map<string, ComputedRow[]>>();

  for (const row of computed) {
    if (!catMap.has(row.category)) catMap.set(row.category, new Map());
    const prodMap = catMap.get(row.category)!;
    if (!prodMap.has(row.product_key)) prodMap.set(row.product_key, []);
    prodMap.get(row.product_key)!.push(row);
  }

  const categoryRows: CategoryTableRow[] = [];

  for (const [category, prodMap] of catMap) {
    const productRows: ProductTableRow[] = [];

    for (const [productKey, warehouseRows] of prodMap) {
      const first = warehouseRows[0];
      const totalBalance = warehouseRows.reduce((s, r) => s + r.balance, 0);
      const totalInTransit = warehouseRows.reduce((s, r) => s + r.in_transit, 0);
      const totalSL = totalBalance + totalInTransit;
      const totalSS = warehouseRows.reduce((s, r) => s + r.SS, 0);
      const totalRL = warehouseRows.reduce((s, r) => s + r.RL, 0);
      const totalOrderQty = warehouseRows.reduce((s, r) => s + r.order_qty, 0);
      const avgDailySales =
        warehouseRows.reduce((s, r) => s + r.avg_daily_sales, 0) /
        warehouseRows.length;
      const avgLt =
        warehouseRows.reduce((s, r) => s + r.avg_lt, 0) / warehouseRows.length;
      const productStatus = dominantStatus(warehouseRows.map((r) => r.status));

      const wRows: WarehouseTableRow[] = warehouseRows.map((r) => ({
        ...r,
        key: `wh-${productKey}-${r.warehouse_key}`,
        rowType: 'warehouse' as const,
      }));

      productRows.push({
        key: `prod-${productKey}`,
        rowType: 'product',
        product_key: productKey,
        product_name: first.product_name,
        sku: first.sku,
        category,
        balance: totalBalance,
        in_transit: totalInTransit,
        SL: totalSL,
        avg_daily_sales: avgDailySales,
        avg_lt: avgLt,
        SS: totalSS,
        RL: totalRL,
        status: productStatus,
        order_qty: totalOrderQty,
        children: wRows,
      });
    }

    const catBalance = productRows.reduce((s, r) => s + r.balance, 0);
    const catInTransit = productRows.reduce((s, r) => s + r.in_transit, 0);
    const catSL = catBalance + catInTransit;
    const catSS = productRows.reduce((s, r) => s + r.SS, 0);
    const catRL = productRows.reduce((s, r) => s + r.RL, 0);
    const catOrderQty = productRows.reduce((s, r) => s + r.order_qty, 0);
    const catAvgDailySales =
      productRows.reduce((s, r) => s + r.avg_daily_sales, 0) /
      productRows.length;
    const catAvgLt =
      productRows.reduce((s, r) => s + r.avg_lt, 0) / productRows.length;
    const catStatus = dominantStatus(productRows.map((r) => r.status));

    categoryRows.push({
      key: `cat-${category}`,
      rowType: 'category',
      category,
      balance: catBalance,
      in_transit: catInTransit,
      SL: catSL,
      avg_daily_sales: catAvgDailySales,
      avg_lt: catAvgLt,
      SS: catSS,
      RL: catRL,
      status: catStatus,
      order_qty: catOrderQty,
      children: productRows,
    });
  }

  return categoryRows;
}

// ─── StatusTag component ──────────────────────────────────────────────────────
function StatusTag({ status }: { status: Status }) {
  const color = STATUS_COLORS[status];
  const icon =
    status === 'КРИТИЧНО' ? (
      <WarningOutlined />
    ) : status === 'НУЖЕН ЗАКАЗ' ? (
      <ExclamationCircleOutlined />
    ) : (
      <CheckCircleOutlined />
    );
  return (
    <Tag color={color} icon={icon} style={{ fontWeight: 600, fontSize: 11 }}>
      {status}
    </Tag>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [asOfDate, setAsOfDate] = useState<Dayjs>(dayjs());
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedWarehouses, setSelectedWarehouses] = useState<string[]>([]);
  const [queryParams, setQueryParams] = useState<Record<string, unknown>>({
    date: dayjs().format('YYYY-MM-DD'),
  });

  // ── Filters meta ─────────────────────────────────────────────────────────────
  const { data: filtersData } = useQuery({
    queryKey: ['analytics-filters'],
    queryFn: async () => {
      const r = await analyticsApi.getFilters();
      return r.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const categoryOptions = useMemo(
    () => (filtersData?.categories ?? []).map((c) => ({ value: c, label: c })),
    [filtersData],
  );
  const warehouseOptions = useMemo(
    () => (filtersData?.warehouses ?? []).map((w) => ({ value: w, label: w })),
    [filtersData],
  );

  // ── MRP data query ────────────────────────────────────────────────────────────
  const {
    data: mrpData,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ['analytics-mrp', queryParams],
    queryFn: async () => {
      const r = await analyticsApi.getMrpData(queryParams);
      return r.data.data;
    },
    staleTime: 2 * 60 * 1000,
  });

  // ── Compute MRP fields ────────────────────────────────────────────────────────
  const computed: ComputedRow[] = useMemo(
    () => (mrpData ?? []).map((row) => computeMrp(row)),
    [mrpData],
  );

  const tableData = useMemo(() => buildTableData(computed), [computed]);

  // ── Summary stats ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = computed.length;
    const critical = computed.filter((r) => r.status === 'КРИТИЧНО').length;
    const needOrder = computed.filter((r) => r.status === 'НУЖЕН ЗАКАЗ').length;
    const ok = computed.filter((r) => r.status === 'ОКЕЙ').length;
    return { total, critical, needOrder, ok };
  }, [computed]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleLoad = () => {
    const params: Record<string, unknown> = {
      date: asOfDate.format('YYYY-MM-DD'),
    };
    if (selectedCategories.length) params.categories = selectedCategories;
    if (selectedWarehouses.length) params.warehouses = selectedWarehouses;
    setQueryParams(params);
  };

  const handleReset = () => {
    setAsOfDate(dayjs());
    setSelectedCategories([]);
    setSelectedWarehouses([]);
    setQueryParams({ date: dayjs().format('YYYY-MM-DD') });
  };

  // ── Table columns ─────────────────────────────────────────────────────────────
  const columns: ColumnsType<AnyTableRow> = [
    {
      title: 'Товар',
      dataIndex: 'product_name',
      key: 'product_name',
      width: 240,
      fixed: 'left',
      render: (_: unknown, record: AnyTableRow) => {
        if (record.rowType === 'category') {
          return (
            <Text strong style={{ fontSize: 13, color: '#1a1a2e' }}>
              {record.category}
            </Text>
          );
        }
        if (record.rowType === 'product') {
          return (
            <div>
              <Text strong style={{ fontSize: 13 }}>
                {record.product_name}
              </Text>
              {record.sku && (
                <Text
                  type="secondary"
                  style={{ display: 'block', fontSize: 11 }}
                >
                  {record.sku}
                </Text>
              )}
            </div>
          );
        }
        // warehouse row — show warehouse name
        return (
          <Text type="secondary" style={{ fontSize: 12, paddingLeft: 8 }}>
            {(record as WarehouseTableRow).warehouse}
          </Text>
        );
      },
    },
    {
      title: 'Склад',
      key: 'warehouse',
      width: 160,
      render: (_: unknown, record: AnyTableRow) => {
        if (record.rowType === 'warehouse') {
          return (
            <Text style={{ fontSize: 12 }}>
              {(record as WarehouseTableRow).warehouse}
            </Text>
          );
        }
        return null;
      },
    },
    {
      title: 'Остаток',
      dataIndex: 'balance',
      key: 'balance',
      width: 110,
      align: 'right',
      render: (val: number) => (
        <Text style={{ fontSize: 12 }}>{val.toLocaleString('ru-RU')}</Text>
      ),
    },
    {
      title: 'В пути',
      dataIndex: 'in_transit',
      key: 'in_transit',
      width: 90,
      align: 'right',
      render: (val: number) => (
        <Text style={{ fontSize: 12 }}>{val.toLocaleString('ru-RU')}</Text>
      ),
    },
    {
      title: 'SL',
      dataIndex: 'SL',
      key: 'SL',
      width: 100,
      align: 'right',
      render: (val: number, record: AnyTableRow) => {
        const status = (record as { status?: Status }).status;
        const color = status ? STATUS_COLORS[status] : undefined;
        return (
          <Text strong style={{ fontSize: 12, color }}>
            {val.toLocaleString('ru-RU')}
          </Text>
        );
      },
    },
    {
      title: 'D̄/день',
      dataIndex: 'avg_daily_sales',
      key: 'avg_daily_sales',
      width: 90,
      align: 'right',
      render: (val: number) => (
        <Text style={{ fontSize: 12 }}>{val.toFixed(2)}</Text>
      ),
    },
    {
      title: 'LT дней',
      dataIndex: 'avg_lt',
      key: 'avg_lt',
      width: 90,
      align: 'right',
      render: (val: number) => (
        <Text style={{ fontSize: 12 }}>{val.toFixed(1)}</Text>
      ),
    },
    {
      title: 'SS',
      dataIndex: 'SS',
      key: 'SS',
      width: 90,
      align: 'right',
      render: (val: number) => (
        <Text style={{ fontSize: 12 }}>{val.toLocaleString('ru-RU')}</Text>
      ),
    },
    {
      title: 'RL',
      dataIndex: 'RL',
      key: 'RL',
      width: 90,
      align: 'right',
      render: (val: number) => (
        <Text style={{ fontSize: 12 }}>{val.toLocaleString('ru-RU')}</Text>
      ),
    },
    {
      title: 'Статус',
      key: 'status',
      width: 150,
      align: 'center',
      render: (_: unknown, record: AnyTableRow) => {
        const status = (record as { status?: Status }).status;
        if (!status) return null;
        return <StatusTag status={status} />;
      },
    },
    {
      title: 'Заказ',
      dataIndex: 'order_qty',
      key: 'order_qty',
      width: 100,
      align: 'right',
      render: (val: number) =>
        val > 0 ? (
          <Text strong style={{ fontSize: 12, color: '#ff4d4f' }}>
            {val.toLocaleString('ru-RU')}
          </Text>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            —
          </Text>
        ),
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1700, margin: '0 auto' }}>
      {/* ── Page header ── */}
      <div
        style={{
          background:
            'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          borderRadius: 16,
          padding: '20px 28px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.10)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <BarChartOutlined style={{ fontSize: 26, color: '#a5b4fc' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{ fontSize: 18, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}
          >
            MRP Аналитика
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.55)',
              marginTop: 2,
            }}
          >
            Расчёт SS, RL, SL по остаткам и продажам
          </div>
        </div>
        {asOfDate && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 20,
              padding: '6px 14px',
              flexShrink: 0,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.45)',
                display: 'block',
                lineHeight: 1.2,
              }}
            >
              По состоянию на
            </Text>
            <Text
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#a5b4fc',
                display: 'block',
                lineHeight: 1.3,
              }}
            >
              {asOfDate.format('DD.MM.YYYY')}
            </Text>
          </div>
        )}
      </div>

      {/* ── Filters card ── */}
      <Card
        size="small"
        style={{ marginBottom: 16, borderRadius: 12 }}
        bodyStyle={{ padding: '16px 20px' }}
      >
        <Row gutter={[16, 12]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                По состоянию на
              </Text>
            </div>
            <DatePicker
              value={asOfDate}
              onChange={(d) => d && setAsOfDate(d)}
              format="DD.MM.YYYY"
              style={{ width: '100%' }}
              allowClear={false}
            />
          </Col>
          <Col xs={24} sm={12} md={7}>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Категория
              </Text>
            </div>
            <Select
              mode="multiple"
              placeholder="Все категории"
              value={selectedCategories}
              onChange={setSelectedCategories}
              options={categoryOptions}
              style={{ width: '100%' }}
              maxTagCount="responsive"
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={7}>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Склад
              </Text>
            </div>
            <Select
              mode="multiple"
              placeholder="Все склады"
              value={selectedWarehouses}
              onChange={setSelectedWarehouses}
              options={warehouseOptions}
              style={{ width: '100%' }}
              maxTagCount="responsive"
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <div style={{ marginBottom: 4, visibility: 'hidden' }}>
              <Text style={{ fontSize: 12 }}>&nbsp;</Text>
            </div>
            <Space>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={handleLoad}
                loading={isFetching}
                style={{
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  border: 'none',
                }}
              >
                Загрузить
              </Button>
              <Button
                icon={<ClearOutlined />}
                onClick={handleReset}
                disabled={isFetching}
              >
                Сбросить
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* ── Summary stat cards ── */}
      {computed.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card
              size="small"
              style={{ borderRadius: 12, textAlign: 'center' }}
              bodyStyle={{ padding: '16px 12px' }}
            >
              <Statistic
                title={
                  <Text style={{ fontSize: 12, color: '#666' }}>
                    Всего позиций
                  </Text>
                }
                value={stats.total}
                valueStyle={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card
              size="small"
              style={{
                borderRadius: 12,
                textAlign: 'center',
                borderColor: '#ffccc7',
                background: '#fff2f0',
              }}
              bodyStyle={{ padding: '16px 12px' }}
            >
              <Statistic
                title={
                  <Text style={{ fontSize: 12, color: '#cf1322' }}>
                    <WarningOutlined style={{ marginRight: 4 }} />
                    Критично
                  </Text>
                }
                value={stats.critical}
                valueStyle={{ fontSize: 24, fontWeight: 700, color: '#ff4d4f' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card
              size="small"
              style={{
                borderRadius: 12,
                textAlign: 'center',
                borderColor: '#ffd591',
                background: '#fffbe6',
              }}
              bodyStyle={{ padding: '16px 12px' }}
            >
              <Statistic
                title={
                  <Text style={{ fontSize: 12, color: '#d46b08' }}>
                    <ExclamationCircleOutlined style={{ marginRight: 4 }} />
                    Нужен заказ
                  </Text>
                }
                value={stats.needOrder}
                valueStyle={{ fontSize: 24, fontWeight: 700, color: '#fa8c16' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card
              size="small"
              style={{
                borderRadius: 12,
                textAlign: 'center',
                borderColor: '#b7eb8f',
                background: '#f6ffed',
              }}
              bodyStyle={{ padding: '16px 12px' }}
            >
              <Statistic
                title={
                  <Text style={{ fontSize: 12, color: '#389e0d' }}>
                    <CheckCircleOutlined style={{ marginRight: 4 }} />
                    Окей
                  </Text>
                }
                value={stats.ok}
                valueStyle={{ fontSize: 24, fontWeight: 700, color: '#52c41a' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* ── Main table ── */}
      <Card
        style={{ borderRadius: 12 }}
        bodyStyle={{ padding: 0 }}
      >
        <Spin spinning={isFetching} tip="Загрузка данных...">
          {isError ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <Empty
                description={
                  <Text type="danger">
                    Ошибка загрузки данных. Проверьте подключение и попробуйте
                    снова.
                  </Text>
                }
              />
            </div>
          ) : tableData.length === 0 && !isFetching ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <Empty
                description={
                  <Text type="secondary">
                    Нет данных. Выберите параметры и нажмите «Загрузить».
                  </Text>
                }
              />
            </div>
          ) : (
            <Table<AnyTableRow>
              columns={columns}
              dataSource={tableData}
              rowKey="key"
              size="small"
              scroll={{ x: 1400 }}
              pagination={false}
              expandable={{ defaultExpandAllRows: false }}
              rowClassName={(record) => {
                if (record.rowType === 'category')
                  return 'analytics-row-category';
                if (record.rowType === 'product')
                  return 'analytics-row-product';
                return 'analytics-row-warehouse';
              }}
              style={{ borderRadius: 12, overflow: 'hidden' }}
            />
          )}
        </Spin>
      </Card>

      {/* Inline row styles */}
      <style>{`
        .analytics-row-category > td {
          background: #f0f2f7 !important;
          font-weight: 600;
        }
        .analytics-row-product > td {
          background: #fff !important;
        }
        .analytics-row-warehouse > td {
          background: #fafafa !important;
          color: #666;
        }
      `}</style>
    </div>
  );
}
