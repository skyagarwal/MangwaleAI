import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryParamsDto {
  @ApiPropertyOptional({ example: 1, description: 'Page number' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, description: 'Items per page' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({ example: 'biryani', description: 'Search query' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ example: 'name', description: 'Sort field' })
  @IsString()
  @IsOptional()
  sort_by?: string = 'id';

  @ApiPropertyOptional({ example: 'DESC', description: 'Sort order (ASC or DESC)' })
  @IsString()
  @IsOptional()
  sort_order?: string = 'DESC';

  @ApiPropertyOptional({ example: 1, description: 'Status filter (1=active, 0=inactive)' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  status?: number;

  @ApiPropertyOptional({ example: 4, description: 'Module ID filter' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  module_id?: number;

  @ApiPropertyOptional({ example: 116, description: 'Store ID filter' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  store_id?: number;

  @ApiPropertyOptional({ example: 288, description: 'Category ID filter' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  category_id?: number;
}
