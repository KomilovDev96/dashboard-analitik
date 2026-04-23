import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { ClickhouseModule } from '../clickhouse/clickhouse.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [ClickhouseModule, CacheModule],
  providers: [SyncService],
  controllers: [SyncController],
  exports: [SyncService],
})
export class SyncModule {}
