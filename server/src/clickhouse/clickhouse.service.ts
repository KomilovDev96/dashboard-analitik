import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import * as https from 'https';

@Injectable()
export class ClickhouseService implements OnModuleInit {
  private readonly logger = new Logger(ClickhouseService.name);
  private baseUrl: URL;
  private username: string;
  private password: string;
  private database: string;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const url = this.configService.get<string>('clickhouse.url') ?? 'http://192.168.183.31:8123';
    this.baseUrl = new URL(url);
    this.username = this.configService.get<string>('clickhouse.username') ?? 'default';
    this.password = this.configService.get<string>('clickhouse.password') ?? '';
    this.database = this.configService.get<string>('clickhouse.database') ?? 'eman_materials';
    this.logger.log(`ClickHouse ready: ${url}/${this.database}`);
  }

  async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    const body = await this.sendRequest(sql);
    return body
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as T);
  }

  async queryWithProgress<T = Record<string, unknown>>(
    sql: string,
    onProgress: (pct: number, loaded: number, total: number) => void,
  ): Promise<T[]> {
    const countRows = await this.query<{ total: string }>(
      `SELECT count() as total FROM (${sql})`,
    );
    const total = parseInt(countRows[0]?.total ?? '0', 10);

    onProgress(10, 0, total);

    const body = await this.sendRequest(sql);
    const lines = body.split('\n').filter((l) => l.trim());
    const rows: T[] = [];

    for (let i = 0; i < lines.length; i++) {
      rows.push(JSON.parse(lines[i]) as T);
      if (i % 500 === 0) {
        const pct = total > 0 ? Math.round(10 + ((i / total) * 88)) : 50;
        onProgress(Math.min(pct, 98), i, total);
      }
    }

    onProgress(100, rows.length, total);
    return rows;
  }

  private sendRequest(sql: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({
        database: this.database,
        default_format: 'JSONEachRow',
      });

      if (this.username) params.set('user', this.username);
      if (this.password) params.set('password', this.password);

      const path = `${this.baseUrl.pathname}?${params.toString()}`;
      const body = Buffer.from(sql + ' FORMAT JSONEachRow', 'utf8');

      const options: http.RequestOptions = {
        hostname: this.baseUrl.hostname,
        port: parseInt(this.baseUrl.port || '8123', 10),
        method: 'POST',
        path,
        timeout: 8000,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Length': body.length,
        },
      };

      const transport = this.baseUrl.protocol === 'https:' ? https : http;

      const req = transport.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const result = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`ClickHouse error ${res.statusCode}: ${result}`));
          } else {
            resolve(result);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('ClickHouse connection timeout'));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}
