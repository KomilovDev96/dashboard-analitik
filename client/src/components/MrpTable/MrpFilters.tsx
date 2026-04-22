import { Card, Row, Col, Select, DatePicker, Button, Space, Tooltip, Alert, App } from 'antd';
import { SearchOutlined, ClearOutlined, SyncOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { mrpApi } from '../../api/mrp';
import { useMrpStore } from '../../stores/mrpStore';
import { useMrpStream } from '../../hooks/useMrpStream';

const { RangePicker } = DatePicker;

export default function MrpFilters() {
  const filters = useMrpStore((s) => s.filters);
  const setFilters = useMrpStore((s) => s.setFilters);
  const resetFilters = useMrpStore((s) => s.resetFilters);
  const preloadedDate = useMrpStore((s) => s.preloadedDate);
  const applyFiltersOnPreloaded = useMrpStore((s) => s.applyFiltersOnPreloaded);
  const isPreloaded = useMrpStore((s) => s.isPreloaded);
  const isStreaming = useMrpStore((s) => s.stream.isStreaming);
  const { start, stop } = useMrpStream();

  const canUsePreloaded =
    isPreloaded &&
    preloadedDate &&
    (!filters.dateTo || filters.dateTo === preloadedDate);

  const handleLoad = () => {
    if (canUsePreloaded) {
      applyFiltersOnPreloaded(filters);
    } else {
      start();
    }
  };
  const qc = useQueryClient();
  const { notification } = App.useApp();

  const {
    data: categories,
    isLoading: loadingCats,
    isError: catsError,
    error: catsErr,
  } = useQuery({
    queryKey: ['mrp-categories'],
    queryFn: async () => {
      const r = await mrpApi.getCategories();
      return r.data.data;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const {
    data: warehouses,
    isLoading: loadingWarehouses,
    isError: whError,
    error: whErr,
  } = useQuery({
    queryKey: ['mrp-warehouses'],
    queryFn: async () => {
      const r = await mrpApi.getWarehouses();
      return r.data.data;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const { data: dateRange } = useQuery({
    queryKey: ['mrp-date-range'],
    queryFn: async () => {
      const r = await mrpApi.getDateRange();
      return r.data.data;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const anyError = catsError || whError;
  const errorMessage = (catsErr as Error)?.message || (whErr as Error)?.message;

  const handleRetry = () => {
    qc.invalidateQueries({ queryKey: ['mrp-categories'] });
    qc.invalidateQueries({ queryKey: ['mrp-warehouses'] });
    qc.invalidateQueries({ queryKey: ['mrp-date-range'] });
    notification.info({ message: 'Повторная загрузка фильтров...', duration: 2 });
  };

  const handleDateChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    if (dates?.[0] && dates?.[1]) {
      setFilters({
        dateFrom: dates[0].format('YYYY-MM-DD'),
        dateTo: dates[1].format('YYYY-MM-DD'),
      });
    } else {
      setFilters({ dateFrom: undefined, dateTo: undefined });
    }
  };

  const handleReset = () => {
    resetFilters();
    stop();
  };

  return (
    <Card
      style={{
        borderRadius: 14,
        marginBottom: 16,
        border: '1px solid #ebebf0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      }}
      styles={{ body: { padding: '16px 20px' } }}
    >
      {anyError && (
        <Alert
          type="error"
          message={`Ошибка загрузки фильтров: ${errorMessage ?? 'Нет связи с сервером'}`}
          description="Проверьте что сервер запущен (npm run start:dev)"
          showIcon
          action={
            <Button size="small" icon={<ReloadOutlined />} onClick={handleRetry}>
              Повторить
            </Button>
          }
          style={{ marginBottom: 12, borderRadius: 8 }}
        />
      )}

      <Row gutter={[12, 12]} align="middle">
        <Col xs={24} sm={12} lg={7}>
          <RangePicker
            style={{ width: '100%' }}
            placeholder={['Дата от', 'Дата до']}
            format="DD.MM.YYYY"
            value={
              filters.dateFrom && filters.dateTo
                ? [dayjs(filters.dateFrom), dayjs(filters.dateTo)]
                : null
            }
            onChange={handleDateChange}
            disabledDate={(d) => {
              if (!dateRange) return false;
              return d.isBefore(dateRange.min) || d.isAfter(dateRange.max);
            }}
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
            onChange={(v) => setFilters({ categories: v })}
            options={categories?.map((c) => ({ value: c, label: c }))}
            maxTagCount={1}
            allowClear
            showSearch
          />
        </Col>

        <Col xs={24} sm={12} lg={5}>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder={loadingWarehouses ? 'Загрузка...' : `Склад (${warehouses?.length ?? 0})`}
            loading={loadingWarehouses}
            value={filters.warehouses ?? []}
            onChange={(v) => setFilters({ warehouses: v })}
            options={warehouses?.map((w) => ({ value: w, label: w }))}
            maxTagCount={1}
            allowClear
            showSearch
          />
        </Col>

        <Col xs={24} sm={12} lg={7}>
          <Space wrap>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleLoad}
              loading={isStreaming}
              style={{
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                border: 'none',
                borderRadius: 8,
              }}
            >
              Загрузить
            </Button>

            {isStreaming && (
              <Tooltip title="Остановить загрузку">
                <Button
                  danger
                  icon={<SyncOutlined spin />}
                  onClick={stop}
                  style={{ borderRadius: 8 }}
                >
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
