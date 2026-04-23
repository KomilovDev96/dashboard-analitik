import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis;
  private connected = false;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    try {
      this.redis = new Redis({
        host: this.configService.get<string>('redis.host'),
        port: this.configService.get<number>('redis.port'),
        retryStrategy: (times) => (times > 3 ? null : times * 500),
        lazyConnect: true,
      });

      this.redis.on('connect', () => {
        this.connected = true;
        this.logger.log('Redis connected');
      });
      this.redis.on('error', (err) => {
        this.connected = false;
        this.logger.warn(`Redis unavailable: ${err.message} — caching disabled`);
      });

      this.redis.connect().catch(() => {});
    } catch {
      this.logger.warn('Redis init failed — caching disabled');
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit();
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.connected) return null;
    try {
      const value = await this.redis.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    if (!this.connected) return;
    try {
      if (ttlSeconds === 0) {
        await this.redis.set(key, JSON.stringify(value)); // без TTL
      } else {
        await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      }
    } catch {
      // silent fail
    }
  }

  async del(key: string): Promise<void> {
    if (!this.connected) return;
    try {
      await this.redis.del(key);
    } catch {
      // silent fail
    }
  }

  async delPattern(pattern: string): Promise<void> {
    if (!this.connected) return;
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length) await this.redis.del(...keys);
    } catch {
      // silent fail
    }
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.connected) return [];
    try {
      return await this.redis.keys(pattern);
    } catch {
      return [];
    }
  }
}
