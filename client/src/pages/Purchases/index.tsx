import { useMemo, useState, useTransition, useRef, useEffect, useCallback } from 'react';
import {
  Card, Row, Col, Select, DatePicker, Button, Space, Tooltip,
  Table, Typography, Input, Empty, Skeleton, App, Progress,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  SearchOutlined, ClearOutlined, SyncOutlined,
  FolderOutlined, FolderOpenOutlined, TagOutlined,
  ShoppingCartOutlined, DollarOutlined, AppstoreOutlined,
  UnorderedListOutlined, PlusSquareOutlined, MinusSquareOutlined,
  LoadingOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { purchasesApi } from '../../api/purchases';
import { mrpApi } from '../../api/mrp';
import type { PurchasesRow } from '../../api/purchases';
import { usePurchasesStore } from '../../stores/purchasesStore';
import { usePurchasesStream } from '../../hooks/usePurchasesStream';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// ─── Цвета уровней ────────────────────────────────────────────────────────────
const LEVEL_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];

// ─── Типы строк дерева ────────────────────────────────────────────────────────
interface LevelRow  { key: string; rowType: 'level';   depth: number; label: string; quantity: number; amount: number; amount_usd: number; order_lines: number; children: TreeRow[]; }
interface ProductRow { key: string; rowType: 'product'; label: string; segment: string; manager: string; currency: string; quantity: number; amount: number; amount_usd: number; order_lines: number; children?: never; }
type TreeRow = LevelRow | ProductRow;

// ─── Построение дерева ────────────────────────────────────────────────────────
function buildTree(rows: PurchasesRow[]): LevelRow[] {
  const getPath = (r: PurchasesRow): string[] => {
    const p: string[] = [r.level_1 || 'Без категории'];
    if (r.level_2 && r.level_2 !== r.level_1) p.push(r.level_2);
    if (r.level_3 && r.level_3 !== r.level_2) p.push(r.level_3);
    if (r.level_4 && r.level_4 !== r.level_3) p.push(r.level_4);
    return p;
  };

  type NodeMap = Map<string, { row: LevelRow; children: NodeMap }>;
  const root: NodeMap = new Map();

  for (const r of rows) {
    const path = getPath(r);
    let cur = root;
    let curKey = '';

    for (let i = 0; i < path.length; i++) {
      const seg = path[i];
      curKey = `${curKey}|${seg}`;
      if (!cur.has(curKey)) {
        cur.set(curKey, {
          row: { key: curKey, rowType: 'level', depth: i, label: seg, quantity: 0, amount: 0, amount_usd: 0, order_lines: 0, children: [] },
          children: new Map(),
        });
      }
      const entry = cur.get(curKey)!;
      entry.row.quantity    += Number(r.quantity);
      entry.row.amount      += Number(r.amount);
      entry.row.amount_usd  += Number(r.amount_usd);
      entry.row.order_lines += Number(r.order_lines);
      cur = entry.children;
    }

    // Продукт — листовой узел
    const prodKey = `${curKey}|prod:${r.product_name}:${r.currency}`;
    const prod: ProductRow = {
      key: prodKey,
      rowType: 'product',
      label: r.product_name,
      segment: r.segment,
      manager: r.manager,
      currency: r.currency,
      quantity: Number(r.quantity),
      amount: Number(r.amount),
      amount_usd: Number(r.amount_usd),
      order_lines: Number(r.order_lines),
    };
    // Добавляем к последнему level-узлу
    const parentEntry = [...cur.entries()].at(-1);
    if (parentEntry) {
      // уже в cur (children последнего level)
    }
    // Ищем родителя — последний level в пути
    let parentMap = root;
    let parentNode: LevelRow | null = null;
    let pk = '';
    for (const seg of path) {
      pk = `${pk}|${seg}`;
      parentNode = parentMap.get(pk)!.row;
      parentMap = parentMap.get(pk)!.children;
    }
    if (parentNode) (parentNode.children as TreeRow[]).push(prod);
  }

  const toTree = (nm: NodeMap): LevelRow[] =>
    [...nm.values()].map(({ row, children }) => {
      row.children = [...toTree(children), ...row.children.filter(c => c.rowType === 'product')];
      return row;
    });

  return toTree(root);
}

function collectAllKeys(rows: TreeRow[]): string[] {
  const keys: string[] = [];
  const walk = (r: TreeRow) => { keys.push(r.key); if ('children' in r && r.children) r.children.forEach(walk); };
  rows.forEach(walk);
  return keys;
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ title, value, icon, color }: { title: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color }}>
        {icon}
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Text>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e', lineHeight: 1.2, marginTop: 2 }}>
          {typeof value === 'number' ? value.toLocaleString('ru-RU') : value}
        </div>
      </div>
    </div>
  );
}

// ─── SearchInput ──────────────────────────────────────────────────────────────
function SearchInput({ onSearch }: { onSearch: (v: string) => void }) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValue(val);
    setLoading(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { onSearch(val); setLoading(false); }, 400);
  };

  const handleClear = () => {
    setValue(''); setLoading(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    onSearch('');
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <Input
      prefix={loading
        ? <LoadingOutlined style={{ color: '#f59e0b', fontSize: 13 }} spin />
        : <SearchOutlined style={{ color: value ? '#f59e0b' : '#bbb', fontSize: 13, transition: 'color 0.2s' }} />
      }
      placeholder="Поиск по товару, категории, менеджеру..."
      value={value}
      onChange={handleChange}
      onClear={handleClear}
      style={{ borderRadius: 10, maxWidth: 380, border: `1.5px solid ${value ? '#f59e0b55' : '#ebebeb'}`, transition: 'border-color 0.2s' }}
      allowClear
    />
  );
}

// ─── Главная страница ─────────────────────────────────────────────────────────
export default function PurchasesPage() {
  const { notification } = App.useApp();
  const qc = useQueryClient();

  const filters      = usePurchasesStore((s) => s.filters);
  const setFilters   = usePurchasesStore((s) => s.setFilters);
  const resetFilters = usePurchasesStore((s) => s.resetFilters);
  const setLastDate  = usePurchasesStore((s) => s.setLastDate);
  const data         = usePurchasesStore((s) => s.data);
  const totalRows    = usePurchasesStore((s) => s.totalRows);
  const stream       = usePurchasesStore((s) => s.stream);
  const { start, stop } = usePurchasesStream((msg) => notification.error({ message: msg, duration: 5 }));
  const autoLoadedRef = useRef(false);

  // ── Фильтры из API ──────────────────────────────────────────────────────────
  const { data: segments,   isLoading: loadingSeg }  = useQuery({ queryKey: ['purchases-segments'],   queryFn: async () => (await purchasesApi.getSegments()).data.data,   staleTime: 10 * 60 * 1000 });
  const { data: categories, isLoading: loadingCats } = useQuery({ queryKey: ['purchases-categories'], queryFn: async () => (await purchasesApi.getCategories()).data.data, staleTime: 10 * 60 * 1000 });
  const { data: managers,   isLoading: loadingMgr }  = useQuery({ queryKey: ['purchases-managers'],   queryFn: async () => (await purchasesApi.getManagers()).data.data,   staleTime: 10 * 60 * 1000 });
  const { data: dateRange } = useQuery({ queryKey: ['purchases-date-range'], queryFn: async () => (await purchasesApi.getDateRange()).data.data, staleTime: 10 * 60 * 1000 });

  // startRef — чтобы useEffect всегда вызывал актуальную версию start
  const startRef = useRef(start);
  useEffect(() => { startRef.current = start; }, [start]);

  // ── Автозагрузка при первом открытии страницы ───────────────────────────────
  useEffect(() => {
    if (!dateRange?.max || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    setLastDate(dateRange.max);
    usePurchasesStore.setState({
      filters: { dateFrom: dateRange.max, dateTo: dateRange.max },
    });
    // setTimeout(0) — ждём пока стор обновится, потом стартуем
    setTimeout(() => startRef.current(), 0);
  }, [dateRange?.max]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Поиск + дерево ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  const handleSearch = useCallback((val: string) => {
    startTransition(() => { setSearch(val); setExpandedKeys([]); });
  }, [startTransition]);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(r =>
      r.product_name.toLowerCase().includes(q) ||
      (r.level_1 || '').toLowerCase().includes(q) ||
      (r.manager || '').toLowerCase().includes(q) ||
      (r.segment || '').toLowerCase().includes(q),
    );
  }, [data, search]);

  const treeData = useMemo(() => buildTree(filtered), [filtered]);
  const allKeys  = useMemo(() => collectAllKeys(treeData), [treeData]);
  const allExpanded = allKeys.length > 0 && expandedKeys.length >= allKeys.length;

  const totalQty    = useMemo(() => filtered.reduce((s, r) => s + Number(r.quantity), 0), [filtered]);
  const totalAmount = useMemo(() => filtered.reduce((s, r) => s + Number(r.amount), 0), [filtered]);
  const totalUsd    = useMemo(() => filtered.reduce((s, r) => s + Number(r.amount_usd), 0), [filtered]);

  const handleReset = () => { resetFilters(); stop(); };
  const handleRetry = () => {
    qc.invalidateQueries({ queryKey: ['purchases-segments'] });
    qc.invalidateQueries({ queryKey: ['purchases-categories'] });
    qc.invalidateQueries({ queryKey: ['purchases-managers'] });
    notification.info({ message: 'Перезагрузка фильтров...', duration: 2 });
  };

  // ── Колонки таблицы ─────────────────────────────────────────────────────────
  const columns: ColumnsType<TreeRow> = [
    {
      title: 'Номенклатура',
      dataIndex: 'label',
      ellipsis: { showTitle: true },
      render: (val: string, record) => {
        if (record.rowType === 'level') {
          const color = LEVEL_COLORS[record.depth] ?? '#667eea';
          const isOpen = expandedKeys.includes(record.key);
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: record.depth * 8 }}>
              <span style={{ color, fontSize: 14 }}>{isOpen ? <FolderOpenOutlined /> : <FolderOutlined />}</span>
              <Text strong style={{ fontSize: 13, color }}>{val}</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>{record.order_lines} стр.</Text>
            </div>
          );
        }
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 4 }}>
            <TagOutlined style={{ color: '#94a3b8', fontSize: 12 }} />
            <Text style={{ fontSize: 12, color: '#1a1a2e' }}>{val}</Text>
            {record.segment && <Text type="secondary" style={{ fontSize: 10, background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 }}>{record.segment}</Text>}
          </div>
        );
      },
    },
    {
      title: 'Кол-во',
      dataIndex: 'quantity',
      width: 130,
      align: 'right',
      sorter: (a, b) => Number(a.quantity) - Number(b.quantity),
      render: (val: number, record) => (
        <Text strong style={{ fontSize: record.rowType === 'level' ? 13 : 12, color: '#1a1a2e' }}>
          {Number(val).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
        </Text>
      ),
    },
    {
      title: 'Сумма',
      dataIndex: 'amount',
      width: 170,
      align: 'right',
      sorter: (a, b) => Number(a.amount) - Number(b.amount),
      render: (val: number, record) => {
        const currency = record.rowType === 'product' ? record.currency : '';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
            <Text strong style={{ fontSize: record.rowType === 'level' ? 13 : 12, color: '#f59e0b' }}>
              {Number(val).toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
            </Text>
            {currency && <Text type="secondary" style={{ fontSize: 10 }}>{currency}</Text>}
          </div>
        );
      },
    },
    {
      title: 'USD',
      dataIndex: 'amount_usd',
      width: 130,
      align: 'right',
      sorter: (a, b) => Number(a.amount_usd) - Number(b.amount_usd),
      render: (val: number) => val > 0 ? (
        <Text style={{ fontSize: 12, color: '#22c55e' }}>
          ${Number(val).toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
        </Text>
      ) : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>,
    },
  ];

  const wasLoaded = stream.progress >= 100 && !stream.isStreaming;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1600, margin: '0 auto' }}>
      <PageHeader />

      {/* Фильтры */}
      <Card style={{ borderRadius: 14, marginBottom: 16, border: '1px solid #ebebf0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }} styles={{ body: { padding: '16px 20px' } }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={12} lg={6}>
            <RangePicker
              style={{ width: '100%' }}
              placeholder={['Дата от', 'Дата до']}
              format="DD.MM.YYYY"
              value={filters.dateFrom && filters.dateTo ? [dayjs(filters.dateFrom), dayjs(filters.dateTo)] : null}
              onChange={(dates) => {
                if (dates?.[0] && dates?.[1]) setFilters({ dateFrom: dates[0].format('YYYY-MM-DD'), dateTo: dates[1].format('YYYY-MM-DD') });
                else setFilters({ dateFrom: undefined, dateTo: undefined });
              }}
              disabledDate={(d) => dateRange ? d.isBefore(dateRange.min) || d.isAfter(dateRange.max) : false}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} lg={5}>
            <Select mode="multiple" style={{ width: '100%' }} placeholder={loadingCats ? 'Загрузка...' : `Категория (${categories?.length ?? 0})`}
              loading={loadingCats} value={filters.categories ?? []} onChange={(v) => setFilters({ categories: v })}
              options={categories?.map((c) => ({ value: c, label: c }))} maxTagCount={1} allowClear showSearch />
          </Col>
          <Col xs={24} sm={12} lg={4}>
            <Select mode="multiple" style={{ width: '100%' }} placeholder={loadingSeg ? 'Загрузка...' : `Сегмент (${segments?.length ?? 0})`}
              loading={loadingSeg} value={filters.segments ?? []} onChange={(v) => setFilters({ segments: v })}
              options={segments?.filter(Boolean).map((s) => ({ value: s, label: s }))} maxTagCount={1} allowClear showSearch />
          </Col>
          <Col xs={24} sm={12} lg={5}>
            <Select mode="multiple" style={{ width: '100%' }} placeholder={loadingMgr ? 'Загрузка...' : `Менеджер (${managers?.length ?? 0})`}
              loading={loadingMgr} value={filters.managers ?? []} onChange={(v) => setFilters({ managers: v })}
              options={managers?.map((m) => ({ value: m, label: m }))} maxTagCount={1} allowClear showSearch />
          </Col>
          <Col xs={24} sm={12} lg={4}>
            <Space wrap>
              <Button type="primary" icon={<SearchOutlined />} onClick={start} loading={stream.isStreaming}
                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', borderRadius: 8 }}>
                Загрузить
              </Button>
              {stream.isStreaming && (
                <Tooltip title="Остановить">
                  <Button danger icon={<SyncOutlined spin />} onClick={stop} style={{ borderRadius: 8 }}>Стоп</Button>
                </Tooltip>
              )}
              <Tooltip title="Сбросить фильтры">
                <Button icon={<ClearOutlined />} onClick={handleReset} style={{ borderRadius: 8 }} />
              </Tooltip>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Прогресс-бар */}
      {stream.isStreaming && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a',
          borderRadius: 12, padding: '12px 20px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <LoadingOutlined style={{ color: '#f59e0b', fontSize: 14 }} spin />
            <Text style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>
              {stream.message || 'Загрузка данных...'}
            </Text>
            <Text style={{ fontSize: 12, color: '#b45309', marginLeft: 'auto' }}>
              {stream.total > 0
                ? `${stream.loaded.toLocaleString('ru-RU')} / ${stream.total.toLocaleString('ru-RU')} записей`
                : 'Подсчёт записей...'}
            </Text>
          </div>
          <Progress
            percent={stream.progress}
            strokeColor={{ '0%': '#f59e0b', '100%': '#d97706' }}
            railColor="#fde68a"
            status="active"
            size="small"
            format={(pct) => (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>{pct}%</span>
            )}
          />
        </div>
      )}

      {data.length > 0 && (
        <>
          {/* Карточки */}
          <Row gutter={12} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}>
              <StatCard title="Всего строк" value={totalRows} icon={<UnorderedListOutlined />} color="#f59e0b" />
            </Col>
            <Col xs={12} sm={6}>
              <StatCard title="После фильтра" value={filtered.length} icon={<AppstoreOutlined />} color="#10b981" />
            </Col>
            <Col xs={12} sm={6}>
              <StatCard title="Кол-во (без пост.)" value={totalQty.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} icon={<ShoppingCartOutlined />} color="#3b82f6" />
            </Col>
            <Col xs={12} sm={6}>
              <StatCard title="Сумма USD" value={`$${totalUsd.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}`} icon={<DollarOutlined />} color="#22c55e" />
            </Col>
          </Row>

          {/* Таблица */}
          <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: 12 }}>
              <SearchInput onSearch={handleSearch} />
              <Tooltip title={allExpanded ? 'Свернуть все' : 'Развернуть все'}>
                <Button size="small" icon={allExpanded ? <MinusSquareOutlined /> : <PlusSquareOutlined />}
                  onClick={() => setExpandedKeys(allExpanded ? [] : allKeys)}
                  style={{ borderRadius: 6, color: '#f59e0b', borderColor: '#f59e0b' }}>
                  {allExpanded ? 'Свернуть' : 'Развернуть'} все
                </Button>
              </Tooltip>
              {isPending && <LoadingOutlined style={{ color: '#f59e0b' }} spin />}
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 'auto' }}>
                <b>{treeData.length}</b> категорий · <b>{filtered.length}</b> позиций
              </Text>
            </div>

            <Table<TreeRow>
              dataSource={treeData}
              columns={columns}
              rowKey="key"
              size="small"
              expandable={{
                expandedRowKeys: expandedKeys,
                onExpandedRowsChange: (keys) => setExpandedKeys(keys as string[]),
                rowExpandable: (r) => 'children' in r && !!r.children?.length,
                expandIcon: ({ expanded, onExpand, record }) => {
                  const has = 'children' in record && !!record.children?.length;
                  if (!has) return <span style={{ marginRight: 22 }} />;
                  return (
                    <span onClick={e => onExpand(record, e)} style={{ cursor: 'pointer', marginRight: 6, color: '#f59e0b', fontSize: 13 }}>
                      {expanded ? <MinusSquareOutlined /> : <PlusSquareOutlined />}
                    </span>
                  );
                },
              }}
              pagination={{ pageSize: 50, showSizeChanger: false, showTotal: t => `Итого: ${t} групп`, style: { padding: '10px 20px' } }}
              scroll={{ x: 700, y: 'calc(100vh - 520px)' }}
              loading={stream.isStreaming}
              rowClassName={(r) => r.rowType === 'level' ? `row-level-${r.depth}` : 'row-product'}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">Нет данных</Text>} /> }}
            />
          </div>
        </>
      )}

      {/* Скелетон во время загрузки */}
      {stream.isStreaming && data.length === 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} active paragraph={{ rows: 1 }} style={{ marginBottom: 12 }} />
          ))}
        </div>
      )}

      {/* Пустые состояния */}
      {!stream.isStreaming && data.length === 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: '60px 24px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {wasLoaded ? (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
              <Text style={{ fontSize: 15, color: '#1a1a2e', fontWeight: 600, display: 'block' }}>
                Данных нет
              </Text>
              <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 6 }}>
                По выбранным фильтрам товаров без поступления не найдено.
              </Text>
            </>
          ) : (
            <>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
              <Text style={{ fontSize: 15, color: '#999', display: 'block' }}>
                Выберите фильтры и нажмите «Загрузить»
              </Text>
              <Text type="secondary" style={{ fontSize: 12, marginTop: 6, display: 'block' }}>
                Показываются только товары, по которым не было поступления
              </Text>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PageHeader() {
  const [checking, setChecking] = useState(false);
  const { notification } = App.useApp();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['purchases-date-range'],
    queryFn: async () => (await purchasesApi.getDateRange()).data.data,
    staleTime: 10 * 60 * 1000,
  });

  const lastDate = data?.max ?? '';
  const isToday  = lastDate === new Date().toISOString().slice(0, 10);
  const label    = isLoading ? 'загрузка...' : lastDate ? dayjs(lastDate).format('DD.MM.YYYY') : '—';

  const handleCheck = async () => {
    setChecking(true);
    try {
      const res = await mrpApi.checkSync();
      const result = res.data.data;
      if (result.updated) {
        notification.success({
          message: 'Найдено обновление!',
          description: `${result.prevDate || '—'} → ${result.newDate}. Кэш очищен.`,
          duration: 8,
        });
        qc.invalidateQueries({ queryKey: ['purchases-date-range'] });
      } else {
        notification.info({ message: 'Обновлений нет', description: `Последние данные: ${result.newDate}`, duration: 4 });
      }
    } catch {
      notification.error({ message: 'Ошибка проверки обновлений', duration: 4 });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      borderRadius: 16, padding: '20px 28px', marginBottom: 20,
      display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{ width: 52, height: 52, borderRadius: 12, background: 'rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
        🛒
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>Закупки без поступления</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
          Товары из заказов, по которым не было поступления на склад
        </div>
      </div>

      {/* Бейдж последнего обновления */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: isToday ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)',
          border: `1px solid ${isToday ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 20, padding: '6px 14px', flexShrink: 0,
        }}>
          {isLoading
            ? <SyncOutlined spin style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }} />
            : isToday
              ? <CheckCircleOutlined style={{ color: '#4ade80', fontSize: 13 }} />
              : <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316' }} />
          }
          <div>
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', display: 'block', lineHeight: 1.2 }}>
              Последнее обновление
            </Text>
            <Text style={{
              fontSize: 12, fontWeight: 700, display: 'block', lineHeight: 1.3,
              color: isLoading ? 'rgba(255,255,255,0.3)' : isToday ? '#4ade80' : '#fb923c',
            }}>
              {label}
            </Text>
          </div>
        </div>

        {/* Кнопка проверки */}
        <Tooltip title="Проверить обновления в ClickHouse">
          <button
            onClick={handleCheck}
            disabled={checking}
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 20, padding: '6px 12px', cursor: checking ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              color: 'rgba(255,255,255,0.7)', fontSize: 12, transition: 'all 0.2s',
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
    </div>
  );
}
