import { Module } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';
import { ClickhouseModule } from '../clickhouse/clickhouse.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [ClickhouseModule, CacheModule],
  providers: [PurchasesService],
  controllers: [PurchasesController],
})
export class PurchasesModule {}
