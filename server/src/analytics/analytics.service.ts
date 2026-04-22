import { Injectable } from '@nestjs/common';
import { ClickhouseService } from '../clickhouse/clickhouse.service';
import { CacheService } from '../cache/cache.service';
import { AnalyticsFilterDto } from './dto/analytics-filter.dto';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly clickhouse: ClickhouseService,
    private readonly cache: CacheService,
  ) {}

  async getMrpData(filters: AnalyticsFilterDto) {
    const cacheKey = `analytics:mrp:${JSON.stringify(filters)}`;
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const dateTo = filters.dateTo
      ? `toDate('${filters.dateTo}')`
      : `toDate(now())`;

    const escape = (v: string) => v.replace(/'/g, "''");

    const categoryFilter =
      filters.categories && filters.categories.length > 0
        ? `AND ph."Уровень_1" IN (${filters.categories.map((c) => `'${escape(c)}'`).join(', ')})`
        : '';

    const warehouseFilter =
      filters.warehouses && filters.warehouses.length > 0
        ? `AND s."Наименование" IN (${filters.warehouses.map((w) => `'${escape(w)}'`).join(', ')})`
        : '';

    const skuFilter =
      filters.skus && filters.skus.length > 0
        ? `AND n."Артикул" IN (${filters.skus.map((s) => `'${escape(s)}'`).join(', ')})`
        : '';

    const sql = `
WITH
sales_30 AS (
  SELECT "Номенклатура_Key",
    SUM("Количество") / 30 as avg_daily,
    stddevPop(daily_qty) as std_daily
  FROM (
    SELECT "Номенклатура_Key", toDate("Дата") as sale_date, SUM("Количество") as daily_qty
    FROM "РеализацияТоваровУслугТовары"
    WHERE toDate("Дата") >= today() - 30
    GROUP BY "Номенклатура_Key", toDate("Дата")
  )
  GROUP BY "Номенклатура_Key"
),
in_transit AS (
  SELECT "Номенклатура_Key", SUM("Количество") as qty
  FROM "ЗаказПоставщику_Товары"
  WHERE "Отменено" = false AND toDate("ДатаПоступления") > today()
  GROUP BY "Номенклатура_Key"
),
lt_stats AS (
  SELECT z."Номенклатура_Key",
    avg(dateDiff('day', toDate(z."Дата"), toDate(p."Дата"))) as avg_lt,
    stddevPop(dateDiff('day', toDate(z."Дата"), toDate(p."Дата"))) as std_lt,
    count() as lt_count
  FROM "ЗаказПоставщику_Товары" z
  JOIN "ПоступлениеТоваров_Товары" p ON p."Распоряжение_Key" = z.uuid
  WHERE z."Отменено" = false
    AND toDate(z."Дата") >= today() - 365
    AND dateDiff('day', toDate(z."Дата"), toDate(p."Дата")) > 0
  GROUP BY z."Номенклатура_Key"
),
balances AS (
  SELECT "Номенклатура_Key", "Склад_Key",
    argMax("КонечныйОстаток", "Дата") as balance,
    max("Дата") as balance_date
  FROM "ТоварыНаСкладах"
  WHERE toDate("Дата") <= ${dateTo}
  GROUP BY "Номенклатура_Key", "Склад_Key"
)
SELECT
  n.uuid as product_key,
  n."Наименование" as product_name,
  n."Артикул" as sku,
  COALESCE(NULLIF(ph."Уровень_1", ''), 'Без категории') as level_1,
  COALESCE(NULLIF(ph."Уровень_2", ''), COALESCE(NULLIF(ph."Уровень_1", ''), 'Без категории')) as level_2,
  COALESCE(NULLIF(ph."Уровень_3", ''), COALESCE(NULLIF(ph."Уровень_2", ''), 'Без категории')) as level_3,
  COALESCE(NULLIF(ph."Уровень_4", ''), COALESCE(NULLIF(ph."Уровень_3", ''), 'Без категории')) as level_4,
  s.uuid as warehouse_key,
  s."Наименование" as warehouse,
  COALESCE(b.balance, 0) as balance,
  formatDateTime(b.balance_date, '%Y-%m-%d') as balance_date,
  COALESCE(t.qty, 0) as in_transit,
  COALESCE(sl.avg_daily, 0) as avg_daily_sales,
  COALESCE(sl.std_daily, 0) as std_daily_sales,
  COALESCE(lt.avg_lt, 0) as avg_lt,
  COALESCE(lt.std_lt, 0) as std_lt,
  COALESCE(lt.lt_count, 0) as lt_count
FROM balances b
JOIN "Номенклатура" n ON n.uuid = b."Номенклатура_Key"
LEFT JOIN products_hierarchy ph ON ph.uuid = n."ВидНоменклатуры_Key"
JOIN "Склады" s ON s.uuid = b."Склад_Key"
LEFT JOIN sales_30 sl ON sl."Номенклатура_Key" = n.uuid
LEFT JOIN in_transit t ON t."Номенклатура_Key" = n.uuid
LEFT JOIN lt_stats lt ON lt."Номенклатура_Key" = n.uuid
WHERE n."ПометкаУдаления" = false
  AND s."ПометкаУдаления" = false
  AND s."ЭтоГруппа" = false
  AND n."ЭтоГруппа" = false
  ${categoryFilter}
  ${warehouseFilter}
  ${skuFilter}
ORDER BY level_1, level_2, level_3, level_4, product_name, warehouse
`;

    const result = await this.clickhouse.query<any>(sql);
    await this.cache.set(cacheKey, result, 300);
    return result;
  }

  async getFilters() {
    const cacheKey = 'analytics:filters';
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const [categoriesRaw, warehousesRaw] = await Promise.all([
      this.clickhouse.query<{ name: string }>(
        `SELECT DISTINCT cat."Наименование" as name
         FROM "Отбор_КатегорияТовара" cat
         WHERE cat."ПометкаУдаления" = false
           AND cat."ЭтоГруппа" = false
         ORDER BY name`,
      ),
      this.clickhouse.query<{ name: string }>(
        `SELECT DISTINCT s."Наименование" as name
         FROM "Склады" s
         WHERE s."ПометкаУдаления" = false
           AND s."ЭтоГруппа" = false
         ORDER BY name`,
      ),
    ]);

    const result = {
      categories: categoriesRaw.map((r) => r.name),
      warehouses: warehousesRaw.map((r) => r.name),
    };

    await this.cache.set(cacheKey, result, 600);
    return result;
  }
}
