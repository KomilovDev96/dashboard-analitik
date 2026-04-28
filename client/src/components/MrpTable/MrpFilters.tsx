import { useEffect, useRef, useMemo } from 'react';
import { Card, Row, Col, Select, DatePicker, Button, Space, Tooltip, Alert, App } from 'antd';
import { SearchOutlined, ClearOutlined, SyncOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { mrpApi } from '../../api/mrp';
import { useMrpStore } from '../../stores/mrpStore';
import { useMrpStream } from '../../hooks/useMrpStream';

const { RangePicker } = DatePicker;

export default function MrpFilters() {
  const filters     = useMrpStore((s) => s.filters);
  const totalRows   = useMrpStore((s) => s.totalRows);
  const isStreaming = useMrpStore((s) => s.stream.isStreaming);
  const setFilters  = useMrpStore((s) => s.setFilters);
  const resetFilters = useMrpStore((s) => s.resetFilters);
  const { start, stop } = useMrpStream();

  const qc = useQueryClient();
  const { notification } = App.useApp();

  // ── Данные фильтров из API ────────────────────────────────────────────────
  const { data: categories, isLoading: loadingCats, isError: catsError, error: catsErr } = useQuery({
    queryKey: ['mrp-categories'],
    queryFn: async () => (await mrpApi.getCategories()).data.data,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const { data: warehouses, isLoading: loadingWarehouses, isError: whError, error: whErr } = useQuery({
    queryKey: ['mrp-warehouses'],
    queryFn: async () => (await mrpApi.getWarehouses()).data.data,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const { data: dateRange } = useQuery({
    queryKey: ['mrp-date-range'],
    queryFn: async () => (await mrpApi.getDateRange()).data.data,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  // ── Авто-старт при первом входе ───────────────────────────────────────────
  const hasAutoStarted = useRef(false);

  // Шаг 1: когда dateRange загрузился — ставим дефолтные даты
  useEffect(() => {
    if (!dateRange || hasAutoStarted.current || filters.dateTo) return;
    setFilters({
      dateFrom: `${new Date().getFullYear()}-01-01`,
      dateTo: dateRange.max,
    });
  }, [dateRange]); // eslint-disable-line react-hooks/exhaustive-deps

  // Шаг 2: когда фильтры с датой готовы и данных ещё нет — авто-загрузка
  useEffect(() => {
    if (!filters.dateTo || totalRows > 0 || isStreaming || hasAutoStarted.current) return;
    hasAutoStarted.current = true;
    start();
  }, [filters.dateTo, totalRows, isStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Options ───────────────────────────────────────────────────────────────
  const categoryOptions = useMemo(
    () => categories?.map((c) => ({ value: c, label: c })) ?? [],
    [categories],
  );
  const warehouseOptions = useMemo(
    () => warehouses?.map((w) => ({ value: w, label: w })) ?? [],
    [warehouses],
  );

  const anyError = catsError || whError;
  const errorMessage = (catsErr as Error)?.message || (whErr as Error)?.message;

  const handleRetry = () => {
    qc.invalidateQueries({ queryKey: ['mrp-categories'] });
    qc.invalidateQueries({ queryKey: ['mrp-warehouses'] });
    qc.invalidateQueries({ queryKey: ['mrp-date-range'] });
    notification.info({ message: 'Повторная загрузка фильтров...', duration: 2 });
  };

  const handleLoad = () => start();

  const handleDateChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setFilters(
      dates?.[0] && dates?.[1]
        ? { dateFrom: dates[0].format('YYYY-MM-DD'), dateTo: dates[1].format('YYYY-MM-DD') }
        : { dateFrom: undefined, dateTo: undefined },
    );
  };

  const handleCategoryChange = (v: string[]) => setFilters({ categories: v });
  const handleWarehouseChange = (v: string[]) => setFilters({ warehouses: v });

  const handleReset = () => {
    stop();
    resetFilters();
    hasAutoStarted.current = false;
  };

  return (
    <Card
      style={{ borderRadius: 14, marginBottom: 16, border: '1px solid #ebebf0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
      styles={{ body: { padding: '16px 20px' } }}
    >
      {anyError && (
        <Alert
          type="error"
          message={`Ошибка загрузки фильтров: ${errorMessage ?? 'Нет связи с сервером'}`}
          description="Проверьте что сервер запущен (npm run start:dev)"
          showIcon
          action={<Button size="small" icon={<ReloadOutlined />} onClick={handleRetry}>Повторить</Button>}
          style={{ marginBottom: 12, borderRadius: 8 }}
        />
      )}

      <Row gutter={[12, 12]} align="middle">
        <Col xs={24} sm={12} lg={7}>
          <RangePicker
            style={{ width: '100%' }}
            placeholder={['Дата от', 'Дата до']}
            format="DD.MM.YYYY"
            value={filters.dateFrom && filters.dateTo ? [dayjs(filters.dateFrom), dayjs(filters.dateTo)] : null}
            onChange={handleDateChange}
            disabledDate={(d) => dateRange ? d.isBefore(dateRange.min) || d.isAfter(dateRange.max) : false}
            allowClear
          />
        </Col>

        <Col xs={24} sm={12} lg={5}>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder={loadingCats ? 'Загрузка...' : `Категория (${categories?.length ?? 0})`}
            loading={loadingCats}
            value={filters.categories ?? []}
            onChange={handleCategoryChange}
            options={categoryOptions}
            maxTagCount={1}
            allowClear
            showSearch
            filterOption={(input, opt) =>
              (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        </Col>

        <Col xs={24} sm={12} lg={5}>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder={loadingWarehouses ? 'Загрузка...' : `Склад (${warehouses?.length ?? 0})`}
            loading={loadingWarehouses}
            value={filters.warehouses ?? []}
            onChange={handleWarehouseChange}
            options={warehouseOptions}
            maxTagCount={1}
            allowClear
            showSearch
            filterOption={(input, opt) =>
              (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        </Col>

        <Col xs={24} sm={12} lg={7}>
          <Space wrap>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleLoad}
              loading={isStreaming}
              style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)', border: 'none', borderRadius: 8 }}
            >
              Загрузить
            </Button>

            {isStreaming && (
              <Tooltip title="Остановить загрузку">
                <Button danger icon={<SyncOutlined spin />} onClick={stop} style={{ borderRadius: 8 }}>
                  Стоп
                </Button>
              </Tooltip>
            )}

            <Tooltip title="Сбросить фильтры">
              <Button icon={<ClearOutlined />} onClick={handleReset} style={{ borderRadius: 8 }} />
            </Tooltip>

            {anyError && (
              <Tooltip title="Повторить загрузку фильтров">
                <Button icon={<ReloadOutlined />} onClick={handleRetry} style={{ borderRadius: 8 }} />
              </Tooltip>
            )}
          </Space>
        </Col>
      </Row>
    </Card>
  );
}
