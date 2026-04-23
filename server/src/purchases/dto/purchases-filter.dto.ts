import { IsOptional, IsString, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PurchasesFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @Transform(({ value }) => Array.isArray(value) ? value : [value]) segments?: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @Transform(({ value }) => Array.isArray(value) ? value : [value]) categories?: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @Transform(({ value }) => Array.isArray(value) ? value : [value]) managers?: string[];

  // JWT токен передаётся через query для SSE (EventSource не поддерживает заголовки)
  @ApiPropertyOptional() @IsOptional() @IsString() token?: string;
}
