import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('check')
  @ApiOperation({ summary: 'Проверить обновления в ClickHouse и сбросить кэш если есть новые данные' })
  async checkNow() {
    const result = await this.sync.runCheck();
    return {
      ...result,
      message: result.updated
        ? `Обновление найдено! ${result.prevDate || '—'} → ${result.newDate}. Кэш очищен.`
        : `Новых данных нет. Последняя дата: ${result.newDate}`,
    };
  }
}
