import { useMemo, useState, useTransition, useRef, useEffect, useCallback } from 'react';
import { Table, Typography, Input, Empty, Row, Col, Skeleton, Button, Tooltip, Grid } from 'antd';
const { useBreakpoint } = Grid;
import type { ColumnsType } from 'antd/es/table';
import {
  SearchOutlined, DatabaseOutlined, ShopOutlined,
  AppstoreOutlined, MinusSquareOutlined, PlusSquareOutlined,
  FolderOutlined, FolderOpenOutlined, TagOutlined, LoadingOutlined,
  FullscreenOutlined, FullscreenExitOutlined,
} from '@ant-design/icons';
import { useMrpStore } from '../../stores/mrpStore';
import type { MrpRow } from '../../types';

const { Text } = Typography;

// ─── Level colours ────────────────────────────────────────────────────────────
const LEVEL_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#ec4899'];

// ─── Tree row type ────────────────────────────────────────────────────────────
interface LevelRow {
  key: string;
  rowType: 'level';
  depth: number;
  label: string;
  balance: number;
  in_transit: number;
  zakazano: number;
  itemCount: number;
  children: TreeRow[];
}
interface ProductRow {
  key: string;
  rowType: 'product';
  label: string;
  balance: number;
  in_transit: number;
  zakazano: number;
  itemCount: number;
  children: WarehouseRow[];
}
interface WarehouseRow {
  key: string;
  rowType: 'warehouse';
  label: string;
  balance: number;
  balance_date?: string;
  itemCount: number;
}
type TreeRow = LevelRow | ProductRow | WarehouseRow;

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ title, value, icon, color }: {
  title: string; value: string | number; icon: React.ReactNode; color: string;
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '16px 20px',
      display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10, background: `${color}15`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color,
      }}>
        {icon}
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {title}
        </Text>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e', lineHeight: 1.2, marginTop: 2 }}>
          {typeof value === 'number' ? value.toLocaleString('ru-RU') : value}
        </div>
      </div>
    </div>
  );
}

// ─── Build tree from flat MrpRow[] ───────────────────────────────────────────
function buildTree(rows: MrpRow[]): LevelRow[] {
  // path per row: [l1, l2?, l3?, l4?] — deduplicate adjacent equal levels
  const getPath = (r: MrpRow): string[] => {
    const path: string[] = [r.level_1 || r.category || 'Без категории'];
    if (r.level_2 && r.level_2 !== r.level_1) path.push(r.level_2);
    if (r.level_3 && r.level_3 !== r.level_2) path.push(r.level_3);
    if (r.level_4 && r.level_4 !== r.level_3) path.push(r.level_4);
    return path;
  };

  // Nested map structure: label → { node, children: Map }
  type NodeMap = Map<string, { row: LevelRow | ProductRow; children: NodeMap }>;

  const root: NodeMap = new Map();

  // in_transit одинаков для всех складов одного товара — считаем только один раз
  // in_transit и zakazano одинаковы для всех складов одного товара — считаем только раз
  const seenPerProduct = new Set<string>();

  for (const r of rows) {
    const path = getPath(r);
    const inTransit = Number(r.in_transit ?? 0);
    const zakazano  = Number(r.zakazano  ?? 0);
    const isFirst   = !seenPerProduct.has(r.product_name);
    if (isFirst) seenPerProduct.add(r.product_name);

    let cur = root;
    let curKey = '';

    for (let i = 0; i < path.length; i++) {
      const seg = path[i];
      curKey = `${curKey}|${seg}`;
      if (!cur.has(curKey)) {
        const node: LevelRow = {
          key: curKey, rowType: 'level', depth: i, label: seg,
          balance: 0, in_transit: 0, zakazano: 0, itemCount: 0, children: [],
        };
        cur.set(curKey, { row: node, children: new Map() });
      }
      const entry = cur.get(curKey)!;
      (entry.row as LevelRow).balance += Number(r.balance);
      if (isFirst) {
        (entry.row as LevelRow).in_transit += inTransit;
        (entry.row as LevelRow).zakazano  += zakazano;
      }
      (entry.row as LevelRow).itemCount += 1;
      cur = entry.children;
    }

    const prodKey = `${curKey}|prod:${r.product_name}`;
    if (!cur.has(prodKey)) {
      const node: ProductRow = {
        key: prodKey, rowType: 'product', label: r.product_name,
        balance: 0, in_transit: inTransit, zakazano, itemCount: 0, children: [],
      };
      cur.set(prodKey, { row: node, children: new Map() });
    }
    const prodEntry = cur.get(prodKey)!;
    (prodEntry.row as ProductRow).balance += Number(r.balance);
    (prodEntry.row as ProductRow).itemCount += 1;

    // Warehouse node (leaf)
    const whKey = `${prodKey}|wh:${r.warehouse}`;
    const whNode: WarehouseRow = {
      key: whKey,
      rowType: 'warehouse',
      label: r.warehouse,
      balance: Number(r.balance),
      balance_date: r.balance_date,
      itemCount: 1,
    };
    (prodEntry.row as ProductRow).children.push(whNode);
  }

  // Convert nested map to tree rows
  const toTreeRows = (nodeMap: NodeMap): TreeRow[] => {
    const result: TreeRow[] = [];
    for (const { row, children } of nodeMap.values()) {
      if (row.rowType === 'level') {
        row.children = toTreeRows(children);
      } else if (row.rowType === 'product') {
        // children already pushed as warehouse rows
      }
      result.push(row);
    }
    return result;
  };

  return toTreeRows(root) as LevelRow[];
}

// ─── Collect ALL keys recursively ─────────────────────────────────────────────
function collectAllKeys(rows: TreeRow[]): string[] {
  const keys: string[] = [];
  const walk = (r: TreeRow) => {
    keys.push(r.key);
    if ('children' in r && r.children) r.children.forEach(walk);
  };
  rows.forEach(walk);
  return keys;
}

// ─── SearchInput — изолирован чтобы ре-рендер инпута не трогал таблицу ───────
function SearchInput({ onSearch }: { onSearch: (v: string) => void }) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValue(val);
    setLoading(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSearch(val);
      setLoading(false);
    }, 400);
  };

  const handleClear = () => {
    setValue('');
    setLoading(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    onSearch('');
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <Input
      prefix={
        loading
          ? <LoadingOutlined style={{ color: '#667eea', fontSize: 13 }} spin />
          : <SearchOutlined style={{ color: value ? '#667eea' : '#bbb', fontSize: 13, transition: 'color 0.2s' }} />
      }
      placeholder="Поиск по номенклатуре, категории, складу..."
      value={value}
      onChange={handleChange}
      onClear={handleClear}
      style={{
        borderRadius: 10,
        maxWidth: 380,
        border: `1.5px solid ${value ? '#667eea55' : '#ebebeb'}`,
        transition: 'border-color 0.2s',
      }}
      allowClear
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function MrpDataTable() {
  const screens = useBreakpoint();
  const data = useMrpStore((s) => s.data);
  const totalRows = useMrpStore((s) => s.totalRows);
  const stream = useMrpStore((s) => s.stream);
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  const colWidth = screens.xl ? 160 : screens.lg ? 140 : 120;

  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      tableWrapRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  const handleSearch = useCallback((val: string) => {
    startTransition(() => {
      setSearch(val);
      setExpandedKeys([]);
    });
  }, [startTransition]);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(r =>
      r.product_name.toLowerCase().includes(q) ||
      (r.level_1 || r.category || '').toLowerCase().includes(q) ||
      r.warehouse.toLowerCase().includes(q),
    );
  }, [data, search]);

  const treeData = useMemo(() => buildTree(filtered), [filtered]);
  const allKeys = useMemo(() => collectAllKeys(treeData), [treeData]);
  const allExpanded = allKeys.length > 0 && expandedKeys.length >= allKeys.length;

  const toggleAll = () => setExpandedKeys(allExpanded ? [] : allKeys);

  const totalBalance    = useMemo(() => filtered.reduce((s, r) => s + Number(r.balance), 0), [filtered]);
  // in_transit суммируем один раз на товар (не на склад)
  const totalInTransit = useMemo(() => {
    const seen = new Set<string>();
    return filtered.reduce((s, r) => {
      if (seen.has(r.product_name)) return s;
      seen.add(r.product_name);
      return s + Number(r.in_transit ?? 0);
    }, 0);
  }, [filtered]);

  const totalZakazano = useMemo(() => {
    const seen = new Set<string>();
    return filtered.reduce((s, r) => {
      if (seen.has(r.product_name)) return s;
      seen.add(r.product_name);
      return s + Number(r.zakazano ?? 0);
    }, 0);
  }, [filtered]);
  const uniqueL1 = treeData.length;

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns: ColumnsType<TreeRow> = [
    {
      title: 'Номенклатура',
      dataIndex: 'label',
      ellipsis: { showTitle: true },
      render: (val: string, record) => {
        if (record.rowType === 'level') {
          const color = LEVEL_COLORS[record.depth] ?? '#667eea';
          const isOpen = expandedKeys.includes(record.key);
          const hasChildren = (record.children?.length ?? 0) > 0;
          return (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: record.depth * 16, cursor: hasChildren ? 'pointer' : 'default' }}
              onClick={() => hasChildren && setExpandedKeys(isOpen ? expandedKeys.filter(k => k !== record.key) : [...expandedKeys, record.key])}
            >
              {hasChildren ? (
                <span style={{ color: '#667eea', fontSize: 12, flexShrink: 0 }}>
                  {isOpen ? <MinusSquareOutlined /> : <PlusSquareOutlined />}
                </span>
              ) : (
                <span style={{ width: 12, flexShrink: 0 }} />
              )}
              <span style={{ color, fontSize: 14, flexShrink: 0 }}>
                {isOpen ? <FolderOpenOutlined /> : <FolderOutlined />}
              </span>
              <Text strong style={{ fontSize: 13, color }}>{val}</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>{record.itemCount} поз.</Text>
            </div>
          );
        }
        if (record.rowType === 'product') {
          const isOpen = expandedKeys.includes(record.key);
          const hasChildren = (record.children?.length ?? 0) > 0;
          return (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 32, cursor: hasChildren ? 'pointer' : 'default' }}
              onClick={() => hasChildren && setExpandedKeys(isOpen ? expandedKeys.filter(k => k !== record.key) : [...expandedKeys, record.key])}
            >
              {hasChildren ? (
                <span style={{ color: '#667eea', fontSize: 12, flexShrink: 0 }}>
                  {isOpen ? <MinusSquareOutlined /> : <PlusSquareOutlined />}
                </span>
              ) : (
                <span style={{ width: 12, flexShrink: 0 }} />
              )}
              <TagOutlined style={{ color: '#94a3b8', fontSize: 12, flexShrink: 0 }} />
              <Text style={{ fontSize: 13, color: '#1a1a2e' }}>{val}</Text>
              <Text type="secondary" style={{ fontSize: 11 }}>{record.itemCount} скл.</Text>
            </div>
          );
        }
        // warehouse
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 52 }}>
            <ShopOutlined style={{ color: '#bbb', fontSize: 12 }} />
            <Text style={{ fontSize: 12, color: '#555' }}>{val}</Text>
          </div>
        );
      },
    },
    {
      title: 'Остаток',
      dataIndex: 'balance',
      width: colWidth,
      align: 'right',
      sorter: (a, b) => Number(a.balance) - Number(b.balance),
      render: (val: number, record) => {
        const n = Number(val);
        const color = n <= 0 ? '#ef4444' : n < 10 ? '#f97316' : '#22c55e';
        const isLevel = record.rowType === 'level';
        const isProduct = record.rowType === 'product';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: isLevel ? `${color}10` : `${color}18`,
              borderRadius: 8, padding: '3px 12px', minWidth: 64,
              border: isLevel ? `1px solid ${color}30` : 'none',
            }}>
              <Text strong style={{ color, fontSize: isLevel ? 14 : isProduct ? 13 : 12 }}>
                {n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
              </Text>
            </div>
            {record.rowType === 'warehouse' && record.balance_date && (
              <Text type="secondary" style={{ fontSize: 10 }}>
                на {record.balance_date}
              </Text>
            )}
          </div>
        );
      },
    },
    {
      title: 'В пути',
      dataIndex: 'in_transit',
      width: colWidth,
      align: 'right',
      sorter: (a, b) => Number((a as LevelRow | ProductRow).in_transit ?? 0) - Number((b as LevelRow | ProductRow).in_transit ?? 0),
      render: (_val: number, record) => {
        if (record.rowType === 'warehouse') return null;
        const n = Number(record.in_transit ?? 0);
        if (n === 0) return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
        const isLevel = record.rowType === 'level';
        return (
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: isLevel ? '#fef3c715' : '#fef3c725',
            border: isLevel ? '1px solid #f59e0b30' : 'none',
            borderRadius: 8, padding: '3px 12px', minWidth: 64,
          }}>
            <Text strong style={{ color: '#f59e0b', fontSize: isLevel ? 14 : 13 }}>
              {n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
            </Text>
          </div>
        );
      },
    },
    {
      title: 'Заказано',
      dataIndex: 'zakazano',
      width: colWidth,
      align: 'right',
      sorter: (a, b) => Number((a as LevelRow | ProductRow).zakazano ?? 0) - Number((b as LevelRow | ProductRow).zakazano ?? 0),
      render: (_val: number, record) => {
        if (record.rowType === 'warehouse') return null;
        const n = Number(record.zakazano ?? 0);
        if (n <= 0) return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
        const isLevel = record.rowType === 'level';
        return (
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: isLevel ? '#eff6ff' : '#dbeafe',
            border: isLevel ? '1px solid #3b82f630' : 'none',
            borderRadius: 8, padding: '3px 12px', minWidth: 64,
          }}>
            <Text strong style={{ color: '#3b82f6', fontSize: isLevel ? 14 : 13 }}>
              {n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
            </Text>
          </div>
        );
      },
    },
  ];

  // ── Skeletons / empty states ───────────────────────────────────────────────
  if (stream.isStreaming && data.length === 0) {
    return (
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} active paragraph={{ rows: 1 }} style={{ marginBottom: 12 }} />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    const wasLoaded = stream.progress >= 100 && !stream.isStreaming;
    return (
      <div style={{
        background: '#fff', borderRadius: 16, padding: '60px 24px',
        textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        {wasLoaded ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <Text style={{ fontSize: 15, color: '#1a1a2e', fontWeight: 600, display: 'block' }}>Данных нет</Text>
            <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 6 }}>
              По выбранным фильтрам ничего не найдено.
            </Text>
          </>
        ) : (
          <>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
            <Text style={{ fontSize: 15, color: '#999', display: 'block' }}>
              Выберите фильтры и нажмите «Загрузить»
            </Text>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats */}
      <Row gutter={12}>
        <Col xs={12} sm={6}>
          <StatCard title="Всего записей" value={totalRows} icon={<DatabaseOutlined />} color="#6366f1" />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title="Остаток"
            value={totalBalance.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
            icon={<ShopOutlined />}
            color="#22c55e"
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title="В пути"
            value={totalInTransit.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
            icon={<AppstoreOutlined />}
            color="#f59e0b"
          />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard
            title="Заказано"
            value={totalZakazano.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
            icon={<DatabaseOutlined />}
            color="#3b82f6"
          />
        </Col>
      </Row>

      {/* Table */}
      <div
        ref={tableWrapRef}
        style={{
          background: '#fff',
          borderRadius: isFullscreen ? 0 : 16,
          overflow: 'hidden',
          boxShadow: isFullscreen ? 'none' : '0 1px 4px rgba(0,0,0,0.06)',
          display: 'flex',
          flexDirection: 'column',
          height: isFullscreen ? '100vh' : undefined,
        }}
      >
        {/* Toolbar */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid #f5f5f5',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          flexShrink: 0,
        }}>
          <SearchInput onSearch={handleSearch} />
          <Tooltip title={allExpanded ? 'Свернуть все' : 'Развернуть все'}>
            <Button
              size="small"
              icon={allExpanded ? <MinusSquareOutlined /> : <PlusSquareOutlined />}
              onClick={toggleAll}
              style={{ borderRadius: 6, color: '#667eea', borderColor: '#667eea', flexShrink: 0 }}
            >
              {allExpanded ? 'Свернуть' : 'Развернуть'} все
            </Button>
          </Tooltip>
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            <b>{uniqueL1}</b> кат. · <b>{filtered.length}</b> поз.
          </Text>
          <Tooltip title={isFullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'}>
            <Button
              size="small"
              icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={toggleFullscreen}
              style={{ borderRadius: 6, flexShrink: 0 }}
            />
          </Tooltip>
        </div>

        <Table<TreeRow>
          dataSource={treeData}
          columns={columns}
          rowKey="key"
          size="small"
          expandable={{
            expandedRowKeys: expandedKeys,
            onExpandedRowsChange: (keys) => setExpandedKeys(keys as string[]),
            rowExpandable: (r) => 'children' in r && (r.children?.length ?? 0) > 0,
            showExpandColumn: false,
          }}
          pagination={{
            pageSize: 50,
            showSizeChanger: false,
            showTotal: total => `Итого: ${total} групп`,
            style: { padding: '10px 20px' },
          }}
          scroll={{
            x: 480,
            y: isFullscreen ? 'calc(100vh - 110px)' : screens.xs ? 'calc(100vh - 520px)' : 'calc(100vh - 420px)',
          }}
          loading={stream.isStreaming}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<Text type="secondary">Нет данных за выбранный период</Text>}
              />
            ),
          }}
          rowClassName={record => {
            if (record.rowType === 'level') return `row-level-${record.depth}`;
            if (record.rowType === 'product') return 'row-product';
            return 'row-warehouse';
          }}
        />
      </div>
    </div>
  );
}
