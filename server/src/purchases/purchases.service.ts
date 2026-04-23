import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { ClickhouseService } from '../clickhouse/clickhouse.service';
import { CacheService } from '../cache/cache.service';
import { PurchasesFilterDto } from './dto/purchases-filter.dto';

@Injectable()
export class PurchasesService {
  constructor(
    private readonly clickhouse: ClickhouseService,
    private readonly cache: CacheService,
  ) {}

  async getSegments(): Promise<string[]> {
    const cacheKey = 'purchases:filters:segments';
    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) return cached;

    const rows = await this.clickhouse.query<{ segment: string }>(
      `SELECT DISTINCT segment FROM purchases WHERE segment != '' ORDER BY segment`,
    );
    const result = rows.map((r) => r.segment);
    await this.cache.set(cacheKey, result, 600);
    return result;
  }

  async getCategories(): Promise<string[]> {
    const cacheKey = 'purchases:filters:categories';
    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) return cached;

    const rows = await this.clickhouse.query<{ level_1: string }>(
      `SELECT DISTINCT level_1 FROM purchases WHERE level_1 != '' ORDER BY level_1`,
    );
    const result = rows.map((r) => r.level_1);
    await this.cache.set(cacheKey, result, 600);
    return result;
  }

  async getManagers(): Promise<string[]> {
    const cacheKey = 'purchases:filters:managers';
    const cached = await this.cache.get<string[]>(cacheKey);
    if (cached) return cached;

    const rows = await this.clickhouse.query<{ manager: string }>(
      `SELECT DISTINCT manager FROM purchases WHERE manager != '' ORDER BY manager`,
    );
    const result = rows.map((r) => r.manager);
    await this.cache.set(cacheKey, result, 600);
    return result;
  }

  async getDateRange(): Promise<{ min: string; max: string }> {
    const cacheKey = 'purchases:filters:date-range';
    const cached = await this.cache.get<{ min: string; max: string }>(cacheKey);
    if (cached) return cached;

    const rows = await this.clickhouse.query<{ min: string; max: string }>(
      `SELECT formatDateTime(min(date),'%Y-%m-%d') AS min, formatDateTime(max(date),'%Y-%m-%d') AS max FROM purchases`,
    );
    const result = rows[0];
    await this.cache.set(cacheKey, result, 600);
    return result;
  }

  async streamReport(filters: PurchasesFilterDto, res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const cacheKey = `purchases:report:${JSON.stringify(filters)}`;

    try {
      const cached = await this.cache.get<unknown[]>(cacheKey);
      if (cached) {
        sendEvent('progress', { pct: 100 });
        sendEvent('done', { data: cached });
        return;
      }

      const sql = this.buildSql(filters);

      const countSql = `SELECT count() AS cnt FROM (${sql})`;
      const countRows = await this.clickhouse.query<{ cnt: string }>(countSql);
      const totalRows = parseInt(countRows[0]?.cnt ?? '0', 10);

      sendEvent('progress', { pct: 10, total: totalRows });

      const result = await this.clickhouse.queryWithProgress<unknown>(
        sql,
        (pct, loaded, total) => {
          sendEvent('progress', {
            pct: 10 + Math.round(pct * 0.88),
            loaded,
            total,
            message: `Загружено ${loaded} из ${total}`,
          });
        },
      );

      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const ttl = Math.floor((midnight.getTime() - now.getTime()) / 1000);

      await this.cache.set(cacheKey, result, ttl);

      sendEvent('progress', { pct: 100 });
      sendEvent('done', { data: result });
    } catch (err) {
      sendEvent('error', { message: err instanceof Error ? err.message : String(err) });
    } finally {
      res.end();
    }
  }

  private buildSql(filters: PurchasesFilterDto): string {
    const conditions: string[] = [
      `"Регистратор_Key" NOT IN (SELECT DISTINCT "Распоряжение_Key" FROM "ПоступлениеТоваров_Товары")`,
    ];

    if (filters.dateFrom) {
      conditions.push(`date >= '${filters.dateFrom}'`);
    }
    if (filters.dateTo) {
      conditions.push(`date <= '${filters.dateTo} 23:59:59'`);
    }
    if (filters.segments?.length) {
      const list = filters.segments
        .map((s) => `'${s.replace(/'/g, "\\'")}'`)
        .join(', ');
      conditions.push(`segment IN (${list})`);
    }
    if (filters.categories?.length) {
      const list = filters.categories
        .map((c) => `'${c.replace(/'/g, "\\'")}'`)
        .join(', ');
      conditions.push(`level_1 IN (${list})`);
    }
    if (filters.managers?.length) {
      const list = filters.managers
        .map((m) => `'${m.replace(/'/g, "\\'")}'`)
        .join(', ');
      conditions.push(`manager IN (${list})`);
    }

    const where = conditions.join(' AND ');

    return `
SELECT
  product                      AS product_name,
  level_1, level_2, level_3, level_4,
  segment, manager, currency,
  sum(quantity)                AS quantity,
  round(sum(amount), 2)        AS amount,
  round(sum(amount_usd), 2)    AS amount_usd,
  count()                      AS order_lines
FROM purchases
WHERE ${where}
GROUP BY product, level_1, level_2, level_3, level_4, segment, manager, currency
ORDER BY level_1, level_2, level_3, level_4, product
`.trim();
  }
}
