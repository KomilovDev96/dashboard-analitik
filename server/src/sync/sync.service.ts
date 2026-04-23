import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClickhouseService } from '../clickhouse/clickhouse.service';
import { CacheService } from '../cache/cache.service';

const LAST_KNOWN_DATE_KEY = 'sync:clickhouse:last_date';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly clickhouse: ClickhouseService,
    private readonly cache: CacheService,
  ) {}

  // Запускается каждый день в 06:00 утра
  @Cron('0 6 * * *', { name: 'clickhouse-sync-check', timeZone: 'Asia/Tashkent' })
  async checkForUpdates() {
    await this.runCheck();
  }

  // Вызывается вручную (например из контроллера) или по крону
  async runCheck(): Promise<{ updated: boolean; prevDate: string; newDate: string }> {
    this.logger.log('Проверяем обновления в ClickHouse...');

    const rows = await this.clickhouse.query<{ last_date: string }>(
      `SELECT formatDateTime(max("Дата"), '%Y-%m-%d') AS last_date
       FROM "ТоварыНаСкладах"
       `,
    );

    const newDate = rows[0]?.last_date ?? '';
    const prevDate = (await this.cache.get<string>(LAST_KNOWN_DATE_KEY)) ?? '';

    if (!newDate) {
      this.logger.warn('ClickHouse вернул пустую дату — пропускаем');
      return { updated: false, prevDate, newDate };
    }

    if (newDate === prevDate) {
      this.logger.log(`Обновлений нет. Последняя дата: ${newDate}`);
      return { updated: false, prevDate, newDate };
    }

    // Новая дата — сбрасываем весь MRP-кэш
    this.logger.log(`Обнаружено обновление: ${prevDate || '(нет)'} → ${newDate}. Очищаем кэш...`);
    await this.clearMrpCache();
    await this.cache.set(LAST_KNOWN_DATE_KEY, newDate, 0); // 0 = без TTL
    this.logger.log('Кэш очищен. Данные будут перезагружены при следующем запросе.');

    return { updated: true, prevDate, newDate };
  }

  // Инициализация при старте: запоминаем текущую дату
  async onModuleInit() {
    try {
      const rows = await this.clickhouse.query<{ last_date: string }>(
        `SELECT formatDateTime(max("Дата"), '%Y-%m-%d') AS last_date
         FROM "ТоварыНаСкладах"
         `,
      );
      const date = rows[0]?.last_date ?? '';
      if (date) {
        const existing = await this.cache.get<string>(LAST_KNOWN_DATE_KEY);
        if (!existing) {
          await this.cache.set(LAST_KNOWN_DATE_KEY, date, 0);
          this.logger.log(`Начальная дата ClickHouse сохранена: ${date}`);
        } else {
          this.logger.log(`Текущая дата в ClickHouse: ${date} (в кэше: ${existing})`);
        }
      }
    } catch (e) {
      this.logger.error('Ошибка инициализации SyncService', e);
    }
  }

  private async clearMrpCache() {
    // Удаляем все ключи mrp:* через паттерн
    const keys = await this.cache.keys('mrp:*');
    if (keys.length === 0) {
      this.logger.log('MRP-кэш уже пуст');
      return;
    }
    await Promise.all(keys.map((k) => this.cache.del(k)));
    this.logger.log(`Удалено ${keys.length} ключей кэша`);
  }
}
