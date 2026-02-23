import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsInt, IsOptional } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Biryani', description: 'Category name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'https://storage.mangwale.ai/mangwale/category/biryani.png' })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiPropertyOptional({ example: 0, description: 'Parent category ID (0 for top-level)' })
  @IsInt()
  @IsOptional()
  parent_id?: number;

  @ApiPropertyOptional({ example: 1, description: 'Display position' })
  @IsInt()
  @IsOptional()
  position?: number;

  @ApiPropertyOptional({ example: 1, description: 'Status (1=active, 0=inactive)' })
  @IsInt()
  @IsOptional()
  status?: number;

  @ApiPropertyOptional({ example: 10, description: 'Priority for sorting' })
  @IsInt()
  @IsOptional()
  priority?: number;

  @ApiProperty({ example: 4, description: 'Module ID' })
  @IsInt()
  module_id!: number;

  @ApiPropertyOptional({ example: 'biryani', description: 'URL-friendly slug' })
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional({ example: 1, description: 'Featured flag (1=yes, 0=no)' })
  @IsInt()
  @IsOptional()
  featured?: number;
}
