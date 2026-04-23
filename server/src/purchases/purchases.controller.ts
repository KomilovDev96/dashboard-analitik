import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PurchasesService } from './purchases.service';
import { PurchasesFilterDto } from './dto/purchases-filter.dto';

@ApiTags('purchases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get('filters/segments')
  getSegments(): Promise<string[]> {
    return this.purchasesService.getSegments();
  }

  @Get('filters/categories')
  getCategories(): Promise<string[]> {
    return this.purchasesService.getCategories();
  }

  @Get('filters/managers')
  getManagers(): Promise<string[]> {
    return this.purchasesService.getManagers();
  }

  @Get('filters/date-range')
  getDateRange(): Promise<{ min: string; max: string }> {
    return this.purchasesService.getDateRange();
  }

  @Get('report/stream')
  streamReport(
    @Query() filters: PurchasesFilterDto,
    @Res() res: Response,
  ): void {
    this.purchasesService.streamReport(filters, res);
  }
}
