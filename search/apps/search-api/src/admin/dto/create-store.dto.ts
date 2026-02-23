import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsInt, IsEmail, Min } from 'class-validator';

export class CreateStoreDto {
  @ApiProperty({ example: 'Kokni Darbar', description: 'Store name' })
  @IsString()
  name!: string;

  @ApiProperty({ example: '+919876543210', description: 'Store phone number' })
  @IsString()
  phone!: string;

  @ApiPropertyOptional({ example: 'store@example.com', description: 'Store email' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'https://storage.mangwale.ai/mangwale/store/logo.webp' })
  @IsString()
  @IsOptional()
  logo?: string;

  @ApiPropertyOptional({ example: 'https://storage.mangwale.ai/mangwale/store/cover.webp' })
  @IsString()
  @IsOptional()
  cover_photo?: string;

  @ApiProperty({ example: '18.5204', description: 'Latitude' })
  @IsString()
  latitude!: string;

  @ApiProperty({ example: '73.8567', description: 'Longitude' })
  @IsString()
  longitude!: string;

  @ApiProperty({ example: 'Shop 12, MG Road, Pune', description: 'Store address' })
  @IsString()
  address!: string;

  @ApiPropertyOptional({ example: 'Thank you for ordering!', description: 'Footer text' })
  @IsString()
  @IsOptional()
  footer_text?: string;

  @ApiPropertyOptional({ example: 100.00, description: 'Minimum order amount' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  minimum_order?: number;

  @ApiPropertyOptional({ example: 15.00, description: 'Commission percentage' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  comission?: number;

  @ApiPropertyOptional({ example: 1, description: 'Schedule order enabled (1=yes, 0=no)' })
  @IsInt()
  @IsOptional()
  schedule_order?: number;

  @ApiPropertyOptional({ example: 1, description: 'Status (1=active, 0=inactive)' })
  @IsInt()
  @IsOptional()
  status?: number;

  @ApiProperty({ example: 1, description: 'Vendor ID' })
  @IsInt()
  vendor_id!: number;

  @ApiPropertyOptional({ example: 1, description: 'Free delivery (1=yes, 0=no)' })
  @IsInt()
  @IsOptional()
  free_delivery?: number;

  @ApiPropertyOptional({ example: 1, description: 'Delivery enabled (1=yes, 0=no)' })
  @IsInt()
  @IsOptional()
  delivery?: number;

  @ApiPropertyOptional({ example: 1, description: 'Take away enabled (1=yes, 0=no)' })
  @IsInt()
  @IsOptional()
  take_away?: number;

  @ApiPropertyOptional({ example: 5.00, description: 'Tax percentage' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  tax?: number;

  @ApiPropertyOptional({ example: 1, description: 'Zone ID' })
  @IsInt()
  @IsOptional()
  zone_id?: number;

  @ApiPropertyOptional({ example: 1, description: 'Active status (1=active, 0=inactive)' })
  @IsInt()
  @IsOptional()
  active?: number;

  @ApiPropertyOptional({ example: 'Monday,Tuesday', description: 'Off days (comma-separated)' })
  @IsString()
  @IsOptional()
  off_day?: string;

  @ApiPropertyOptional({ example: 'GST1234567890', description: 'GST number' })
  @IsString()
  @IsOptional()
  gst?: string;

  @ApiPropertyOptional({ example: 0, description: 'Self delivery system (1=yes, 0=no)' })
  @IsInt()
  @IsOptional()
  self_delivery_system?: number;

  @ApiPropertyOptional({ example: 0, description: 'POS system (1=yes, 0=no)' })
  @IsInt()
  @IsOptional()
  pos_system?: number;

  @ApiPropertyOptional({ example: 20.00, description: 'Minimum shipping charge' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  minimum_shipping_charge?: number;

  @ApiPropertyOptional({ example: '30-40', description: 'Delivery time in minutes' })
  @IsString()
  @IsOptional()
  delivery_time?: string;

  @ApiPropertyOptional({ example: 1, description: 'Veg items available (1=yes, 0=no)' })
  @IsInt()
  @IsOptional()
  veg?: number;

  @ApiPropertyOptional({ example: 1, description: 'Non-veg items available (1=yes, 0=no)' })
  @IsInt()
  @IsOptional()
  non_veg?: number;

  @ApiProperty({ example: 4, description: 'Module ID' })
  @IsInt()
  module_id!: number;

  @ApiPropertyOptional({ example: '09:00:00', description: 'Opening time (HH:MM:SS)' })
  @IsString()
  @IsOptional()
  opening_time?: string;

  @ApiPropertyOptional({ example: '23:00:00', description: 'Closing time (HH:MM:SS)' })
  @IsString()
  @IsOptional()
  closing_time?: string;
}
