import { Injectable, Logger } from '@nestjs/common';
import { ClickhouseService } from '../clickhouse/clickhouse.service';
import { CacheService } from '../cache/cache.service';
import { MrpFilterDto } from './dto/mrp-filter.dto';
import { Response } from 'express';

const CACHE_TTL = {
  FILTERS: 600,   // 10 min
  REPORT: 86400,  // until end of day
};

// Подзапрос: Заказано = A - B
// A = сумма Количество из УникальнаяЗаказПоставщику_Товары (с дедупликацией по uuid+Номенклатура_Key)
// B = сумма quantity из purchases, у которых purchase_order+product_id есть в УникальнаяЗаказПоставщику
// Средние продажи в день за последние 6 месяцев (с первого числа 6 мес. назад)
const AVG_SALES_SUBQUERY = `
  SELECT
    product_id,
    sum(quantity) / dateDiff('day',
      toStartOfMonth(toDate(now()) - INTERVAL 6 MONTH),
      toDate(now())
    ) AS avg_daily_sales
  FROM sales_analysis
  WHERE sale_date >= toStartOfMonth(toDate(now()) - INTERVAL 6 MONTH)
    AND quantity > 0
  GROUP BY product_id
`;

const ZAKAZANO_SUBQUERY = `
  SELECT
    z."Номенклатура_Key",
    sum(z."Количество") - coalesce(sum(p.qty), 0) AS zakazano
  FROM (
    SELECT uuid, "Номенклатура_Key", sum("Количество") AS "Количество"
    FROM "ЗаказПоставщику_Товары"
    WHERE "Отменено" = false
    GROUP BY uuid, "Номенклатура_Key"
  ) z
  LEFT JOIN (
    SELECT product_id, purchase_order, sum(quantity) AS qty
    FROM purchases
    WHERE concat(toString(purchase_order), toString(product_id)) IN (
      SELECT concat(toString(uuid), toString("Номенклатура_Key"))
      FROM "ЗаказПоставщику_Товары"
      WHERE "Отменено" = false
    )
    GROUP BY product_id, purchase_order
  ) p ON z."Номенклатура_Key" = p.product_id AND z.uuid = p.purchase_order
  GROUP BY z."Номенклатура_Key"
`;

@Injectable()
export class MrpService {
  private readonly logger = new Logger(MrpService.name);

  constructor(
    private clickhouse: ClickhouseService,
    private cache: CacheService,
  ) {}

  // ─── Filters ───────────────────────────────────────────────────────────────

  async getCategories(): Promise<string[]> {
    const cacheKey = 'mrp:filters:categories';
    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) return cached;

    const rows = await this.clickhouse.query<{ category: string }>(
      `SELECT DISTINCT "Уровень_1" AS category
       FROM products_hierarchy
       WHERE "Уровень_1" != ''
       ORDER BY category`,
    );
    const result = rows.map((r) => r.category).filter(Boolean);
    await this.cache.set(cacheKey, result, CACHE_TTL.FILTERS);
    return result;
  }

  async getWarehouses(): Promise<string[]> {
    const cacheKey = 'mrp:filters:warehouses';
    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) return cached;

    const rows = await this.clickhouse.query<{ warehouse: string }>(
      `SELECT DISTINCT "Наименование" AS warehouse
       FROM "Склады"
       WHERE "Наименование" != ''
       ORDER BY warehouse`,
    );
    const result = rows.map((r) => r.warehouse).filter(Boolean);
    await this.cache.set(cacheKey, result, CACHE_TTL.FILTERS);
    return result;
  }

  async getDateRange(): Promise<{ min: string; max: string }> {
    const cacheKey = 'mrp:filters:daterange';
    const cached = await this.cache.get<{ min: string; max: string }>(cacheKey);
    if (cached) return cached;

    const rows = await this.clickhouse.query<{ min: string; max: string }>(
      `SELECT
         formatDateTime(min("Дата"), '%Y-%m-%d') AS min,
         formatDateTime(max("Дата"), '%Y-%m-%d') AS max
       FROM "ТоварыНаСкладах"`,
    );
    const result = rows[0] ?? { min: '', max: '' };
    await this.cache.set(cacheKey, result, CACHE_TTL.FILTERS);
    return result;
  }

  async getLastUpdate(): Promise<{ lastUpdate: string; serverDate: string; isToday: boolean; daysAgo: number }> {
    const cacheKey = 'mrp:filters:lastupdate';
    const cached = await this.cache.get<{ lastUpdate: string; serverDate: string; isToday: boolean; daysAgo: number }>(cacheKey);
    if (cached) return cached;

    const rows = await this.clickhouse.query<{ lastUpdate: string; today: string }>(
      `SELECT
         formatDateTime(max("Дата"), '%Y-%m-%d', 'Asia/Tashkent') AS lastUpdate,
         formatDateTime(now(),       '%Y-%m-%d', 'Asia/Tashkent') AS today
       FROM "ТоварыНаСкладах"`,
    );

    const lastUpdate = rows[0]?.lastUpdate ?? '';
    const serverDate = rows[0]?.today ?? new Date().toISOString().slice(0, 10);
    const isToday = !!lastUpdate && lastUpdate === serverDate;
    const daysAgo = lastUpdate && serverDate
      ? Math.max(0, Math.floor(
          (new Date(serverDate).getTime() - new Date(lastUpdate).getTime()) / 86_400_000,
        ))
      : 0;
    const result = {
      lastUpdate,
      serverDate,
      isToday,
      daysAgo,
    };

    await this.cache.set(cacheKey, result, 60); // 1 min cache
    return result;
  }

  // ─── Report (paginated, cached) ────────────────────────────────────────────

  async getReport(filters: MrpFilterDto) {
    const cacheKey = `mrp:report:${JSON.stringify(filters)}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const { sql, countSql } = this.buildSql(filters);
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 100;
    const offset = (page - 1) * pageSize;

    const [rows, countRows] = await Promise.all([
      this.clickhouse.query<MrpRow>(
        `${sql} LIMIT ${pageSize} OFFSET ${offset}`,
      ),
      this.clickhouse.query<{ total: string }>(countSql),
    ]);

    const total = parseInt(countRows[0]?.total ?? '0', 10);
    const result = {
      data: rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    await this.cache.set(cacheKey, result, CACHE_TTL.REPORT);
    return result;
  }

  // ─── Preload: all data for latest date (no user filters) ──────────────────

  async streamPreload(res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Check Redis cache first
      const cacheKey = 'mrp:preload:stream';
      const cached = await this.cache.get<{ data: MrpRow[]; total: number; date: string }>(cacheKey);
      if (cached) {
        send('progress', { pct: 100, message: 'Данные из кэша', loaded: cached.total, total: cached.total });
        send('done', cached);
        return;
      }

      const sql = `
        SELECT
          n."Наименование"                                AS product_name,
          ph."Уровень_1"                                  AS category,
          ph."Уровень_1"                                  AS level_1,
          ph."Уровень_2"                                  AS level_2,
          ph."Уровень_3"                                  AS level_3,
          ph."Уровень_4"                                  AS level_4,
          s."Наименование"                                AS warehouse,
          argMax(t."КонечныйОстаток", t."Дата")          AS balance,
          formatDateTime(max(t."Дата"), '%d.%m.%Y')       AS balance_date,
          any(coalesce(pit.in_transit, 0))                AS in_transit,
          any(coalesce(zk.zakazano, 0))                   AS zakazano,
          any(coalesce(avgs.avg_daily_sales, 0))          AS avg_daily_sales
        FROM "ТоварыНаСкладах" t
        INNER JOIN "Номенклатура" n      ON t."Номенклатура_Key"    = n.uuid
        INNER JOIN products_hierarchy ph ON n."ВидНоменклатуры_Key" = ph.uuid
        INNER JOIN "Склады" s            ON t."Склад_Key"           = s.uuid
        LEFT JOIN (
          SELECT product_id, sum(quantity) AS in_transit
          FROM purchases
          WHERE "Регистратор_Key" NOT IN (
            SELECT DISTINCT "Распоряжение_Key" FROM "ПоступлениеТоваров_Товары"
          )
          GROUP BY product_id
        ) pit ON t."Номенклатура_Key" = pit.product_id
        LEFT JOIN (${ZAKAZANO_SUBQUERY}) zk ON t."Номенклатура_Key" = zk."Номенклатура_Key"
        LEFT JOIN (${AVG_SALES_SUBQUERY}) avgs ON t."Номенклатура_Key" = avgs.product_id
        GROUP BY
          n."Наименование", ph."Уровень_1", ph."Уровень_2",
          ph."Уровень_3", ph."Уровень_4", s."Наименование"
        ORDER BY ph."Уровень_1", ph."Уровень_2", ph."Уровень_3", ph."Уровень_4", n."Наименование"
      `;

      send('progress', { pct: 5, message: 'Подсчёт записей...' });

      const countRows = await this.clickhouse.query<{ total: string }>(
        `SELECT count() AS total FROM (${sql})`,
      );
      const total = parseInt(countRows[0]?.total ?? '0', 10);

      send('progress', { pct: 10, message: `Найдено ${total} записей. Загрузка...`, loaded: 0, total });

      const rows = await this.clickhouse.queryWithProgress<MrpRow>(
        sql,
        (pct, loaded, _total) => {
          send('progress', {
            pct: 10 + Math.round(pct * 0.88),
            loaded,
            total: _total,
            message: `Загружено ${loaded} из ${_total}`,
          });
        },
      );

      // Get the preloaded date
      const dateRows = await this.clickhouse.query<{ d: string }>(
        `SELECT formatDateTime(max("Дата"), '%Y-%m-%d') AS d FROM "ТоварыНаСкладах"`,
      );
      const preloadDate = dateRows[0]?.d ?? '';

      const result = { data: rows, total, date: preloadDate };

      // Cache until end of day (seconds until midnight)
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const ttl = Math.floor((midnight.getTime() - now.getTime()) / 1000);
      await this.cache.set(cacheKey, result, ttl);

      send('done', result);
    } catch (error) {
      send('error', { message: (error as Error).message });
    } finally {
      res.end();
    }
  }

  // ─── SSE streaming with real progress ──────────────────────────────────────

  async streamReport(filters: MrpFilterDto, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const { sql } = this.buildSql(filters);

      send('progress', { pct: 5, message: 'Подсчёт записей...' });

      const countRows = await this.clickhouse.query<{ total: string }>(
        `SELECT count() as total FROM (${sql})`,
      );
      const total = parseInt(countRows[0]?.total ?? '0', 10);

      send('progress', { pct: 10, message: `Найдено ${total} записей. Загрузка...` });

      const rows = await this.clickhouse.queryWithProgress<MrpRow>(
        sql,
        (pct, loaded, _total) => {
          send('progress', {
            pct: 10 + Math.round(pct * 0.88),
            loaded,
            total: _total,
            message: `Загружено ${loaded} из ${_total}`,
          });
        },
      );

      send('done', { data: rows, total });
    } catch (error) {
      send('error', { message: (error as Error).message });
    } finally {
      res.end();
    }
  }

  // ─── SQL builder ───────────────────────────────────────────────────────────

  private buildSql(filters: MrpFilterDto): { sql: string; countSql: string } {
    // Use argMax(КонечныйОстаток, Дата) — per product+warehouse returns the balance
    // on the latest available date that is <= dateTo.
    // This is correct: each nomenclature uses its own last date, not a global max.
    const conditions: string[] = [];

    if (filters.dateTo) {
      conditions.push(`t."Дата" <= '${filters.dateTo}'`);
    }

    if (filters.categories?.length) {
      const list = filters.categories.map((c) => `'${c.replace(/'/g, "\\'")}'`).join(',');
      conditions.push(`ph."Уровень_1" IN (${list})`);
    }

    if (filters.warehouses?.length) {
      const list = filters.warehouses.map((w) => `'${w.replace(/'/g, "\\'")}'`).join(',');
      conditions.push(`s."Наименование" IN (${list})`);
    }

    if (filters.skus?.length) {
      const list = filters.skus.map((k) => `'${k.replace(/'/g, "\\'")}'`).join(',');
      conditions.push(`n."Наименование" IN (${list})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        n."Наименование"                                AS product_name,
        ph."Уровень_1"                                  AS category,
        ph."Уровень_1"                                  AS level_1,
        ph."Уровень_2"                                  AS level_2,
        ph."Уровень_3"                                  AS level_3,
        ph."Уровень_4"                                  AS level_4,
        s."Наименование"                                AS warehouse,
        argMax(t."КонечныйОстаток", t."Дата")          AS balance,
        formatDateTime(max(t."Дата"), '%d.%m.%Y')       AS balance_date,
        any(coalesce(pit.in_transit, 0))                AS in_transit,
        any(coalesce(zk.zakazano, 0))                   AS zakazano,
        any(coalesce(avgs.avg_daily_sales, 0))          AS avg_daily_sales
      FROM "ТоварыНаСкладах" t
      INNER JOIN "Номенклатура" n      ON t."Номенклатура_Key"    = n.uuid
      INNER JOIN products_hierarchy ph ON n."ВидНоменклатуры_Key" = ph.uuid
      INNER JOIN "Склады" s            ON t."Склад_Key"           = s.uuid
      LEFT JOIN (
        SELECT product_id, sum(quantity) AS in_transit
        FROM purchases
        WHERE "Регистратор_Key" NOT IN (
          SELECT DISTINCT "Распоряжение_Key" FROM "ПоступлениеТоваров_Товары"
        )
        GROUP BY product_id
      ) pit ON t."Номенклатура_Key" = pit.product_id
      LEFT JOIN (${ZAKAZANO_SUBQUERY}) zk ON t."Номенклатура_Key" = zk."Номенклатура_Key"
      LEFT JOIN (${AVG_SALES_SUBQUERY}) avgs ON t."Номенклатура_Key" = avgs.product_id
      ${where}
      GROUP BY
        t."Номенклатура_Key", t."Склад_Key",
        n."Наименование",
        ph."Уровень_1", ph."Уровень_2", ph."Уровень_3", ph."Уровень_4",
        s."Наименование"
      ORDER BY ph."Уровень_1", ph."Уровень_2", ph."Уровень_3", ph."Уровень_4", n."Наименование"
    `;

    const countSql = `SELECT count() AS total FROM (${sql})`;
    return { sql, countSql };
  }
}

export interface MrpRow {
  product_name: string;
  category: string;
  warehouse: string;
  balance: number;
  in_transit: number;
  zakazano: number;
  avg_daily_sales: number;
}
