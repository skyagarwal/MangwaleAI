import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsBoolean, Min, IsInt, IsEnum, IsArray } from 'class-validator';

export class CreateItemDto {
  @ApiProperty({ example: 'Chicken Biryani', description: 'Item name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Delicious aromatic biryani with chicken', description: 'Item description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'https://storage.mangwale.ai/mangwale/product/item.webp' })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiProperty({ example: 288, description: 'Primary category ID' })
  @IsInt()
  category_id!: number;

  @ApiPropertyOptional({ example: '288,289', description: 'Comma-separated category IDs' })
  @IsString()
  @IsOptional()
  category_ids?: string;

  @ApiProperty({ example: 250.00, description: 'Item price' })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ example: 5.00, description: 'Tax amount or percentage' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  tax?: number;

  @ApiPropertyOptional({ example: 'percent', description: 'Tax type: percent or amount', enum: ['percent', 'amount'] })
  @IsEnum(['percent', 'amount'])
  @IsOptional()
  tax_type?: string;

  @ApiPropertyOptional({ example: 10.00, description: 'Discount amount or percentage' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;

  @ApiPropertyOptional({ example: 'percent', description: 'Discount type: percent or amount', enum: ['percent', 'amount'] })
  @IsEnum(['percent', 'amount'])
  @IsOptional()
  discount_type?: string;

  @ApiPropertyOptional({ example: '09:00:00', description: 'Available from time (HH:MM:SS)' })
  @IsString()
  @IsOptional()
  available_time_starts?: string;

  @ApiPropertyOptional({ example: '23:00:00', description: 'Available until time (HH:MM:SS)' })
  @IsString()
  @IsOptional()
  available_time_ends?: string;

  @ApiPropertyOptional({ example: 1, description: 'Vegetarian flag (1=veg, 0=non-veg)' })
  @IsInt()
  @IsOptional()
  veg?: number;

  @ApiPropertyOptional({ example: 1, description: 'Status (1=active, 0=inactive)' })
  @IsInt()
  @IsOptional()
  status?: number;

  @ApiProperty({ example: 116, description: 'Store ID' })
  @IsInt()
  store_id!: number;

  @ApiProperty({ example: 4, description: 'Module ID' })
  @IsInt()
  module_id!: number;

  @ApiPropertyOptional({ example: 100, description: 'Stock quantity' })
  @IsInt()
  @IsOptional()
  stock?: number;

  @ApiPropertyOptional({ example: 1, description: 'Recommended flag (1=yes, 0=no)' })
  @IsInt()
  @IsOptional()
  recommended?: number;

  @ApiPropertyOptional({ example: 1, description: 'Organic flag (1=yes, 0=no)' })
  @IsInt()
  @IsOptional()
  organic?: number;

  @ApiPropertyOptional({ example: 1, description: 'Approved flag (1=approved, 0=pending)' })
  @IsInt()
  @IsOptional()
  is_approved?: number;

  @ApiPropertyOptional({ description: 'Variations JSON', example: '[{"type":"Size","price":50}]' })
  @IsString()
  @IsOptional()
  variations?: string;

  @ApiPropertyOptional({ description: 'Food variations JSON', example: '[{"name":"Regular","price":0}]' })
  @IsString()
  @IsOptional()
  food_variations?: string;

  @ApiPropertyOptional({ description: 'Add-ons (comma-separated IDs)', example: '1,2,3' })
  @IsString()
  @IsOptional()
  add_ons?: string;

  @ApiPropertyOptional({ description: 'Choice options JSON' })
  @IsString()
  @IsOptional()
  choice_options?: string;

  @ApiPropertyOptional({ description: 'Additional images (JSON array)' })
  @IsString()
  @IsOptional()
  images?: string;

  @ApiPropertyOptional({ description: 'Maximum cart quantity', example: 10 })
  @IsInt()
  @IsOptional()
  maximum_cart_quantity?: number;
}
