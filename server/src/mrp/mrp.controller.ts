import { Controller, Get, Query, Res, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MrpService } from './mrp.service';
import { MrpFilterDto } from './dto/mrp-filter.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('MRP')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mrp')
export class MrpController {
  constructor(private readonly mrpService: MrpService) {}

  @Get('filters/categories')
  @ApiOperation({ summary: 'Get product categories for filter' })
  getCategories() {
    return this.mrpService.getCategories();
  }

  @Get('filters/warehouses')
  @ApiOperation({ summary: 'Get warehouses for filter' })
  getWarehouses() {
    return this.mrpService.getWarehouses();
  }

  @Get('filters/date-range')
  @ApiOperation({ summary: 'Get available date range' })
  getDateRange() {
    return this.mrpService.getDateRange();
  }

  @Get('filters/last-update')
  @ApiOperation({ summary: 'Get last ClickHouse update date (server-side comparison)' })
  getLastUpdate() {
    return this.mrpService.getLastUpdate();
  }

  @Get('preload/stream')
  @ApiOperation({ summary: 'Preload all data for latest date (splash screen)' })
  streamPreload(@Query() filters: MrpFilterDto, @Res() res: Response) {
    return this.mrpService.streamPreload(res);
  }

  @Get('report')
  @ApiOperation({ summary: 'Get MRP report (paginated)' })
  getReport(@Query() filters: MrpFilterDto) {
    return this.mrpService.getReport(filters);
  }

  @Get('report/stream')
  @ApiOperation({ summary: 'Stream MRP report with SSE progress (100%)' })
  streamReport(@Query() filters: MrpFilterDto, @Res() res: Response) {
    return this.mrpService.streamReport(filters, res);
  }

  @Get('monthly-sales')
  @ApiOperation({ summary: 'Monthly sales breakdown for a product (last 6 months)' })
  getProductMonthlySales(@Query('productId') productId: string) {
    if (!productId) throw new BadRequestException('productId is required');
    return this.mrpService.getProductMonthlySales(productId);
  }
}
