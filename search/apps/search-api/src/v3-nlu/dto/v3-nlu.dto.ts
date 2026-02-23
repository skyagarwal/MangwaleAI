import { IsString, IsOptional, IsNumber, IsObject, Min, Max, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UnderstandQueryDto {
  @ApiProperty({ description: 'Natural language search query', example: 'cheap veg biryani near me' })
  @IsString()
  q!: string;

  @ApiPropertyOptional({ description: 'User ID for personalization', example: 123 })
  @IsOptional()
  @IsNumber()
  user_id?: number;

  @ApiPropertyOptional({ description: 'Zone ID for location-based search', example: 4 })
  @IsOptional()
  @IsNumber()
  zone_id?: number;

  @ApiPropertyOptional({ description: 'Module ID (4=food, 5=ecom)', example: 4, default: 4 })
  @IsOptional()
  @IsNumber()
  module_id?: number;

  @ApiPropertyOptional({ 
    description: 'User location', 
    example: { lat: 19.0760, lon: 72.8777 } 
  })
  @IsOptional()
  @IsObject()
  location?: { lat: number; lon: number };
}

export class ConversationalSearchDto {
  @ApiProperty({ description: 'User message in conversation', example: 'veg under 200' })
  @IsString()
  message!: string;

  @ApiProperty({ description: 'Session ID to maintain conversation context', example: 'abc123def456' })
  @IsString()
  session_id!: string;

  @ApiPropertyOptional({ description: 'User ID', example: 123 })
  @IsOptional()
  @IsNumber()
  user_id?: number;

  @ApiPropertyOptional({ description: 'Zone ID', example: 4 })
  @IsOptional()
  @IsNumber()
  zone_id?: number;

  @ApiPropertyOptional({ description: 'Module ID (4=food, 5=ecom)', example: 4, default: 4 })
  @IsOptional()
  @IsNumber()
  module_id?: number;

  @ApiPropertyOptional({ description: 'Number of results to return', example: 20, default: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class VoiceSearchDto {
  @ApiProperty({ description: 'Base64 encoded audio data', example: 'UklGRiQAAABXQVZF...' })
  @IsString()
  audio!: string;

  @ApiProperty({ description: 'Audio format', example: 'wav', enum: ['wav', 'mp3', 'ogg'] })
  @IsString()
  format!: string;

  @ApiPropertyOptional({ description: 'Language code', example: 'hi', enum: ['hi', 'en', 'mr'] })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'User ID', example: 123 })
  @IsOptional()
  @IsNumber()
  user_id?: number;

  @ApiProperty({ description: 'Zone ID', example: 4 })
  @IsNumber()
  zone_id!: number;

  @ApiPropertyOptional({ 
    description: 'User location', 
    example: { lat: 19.0760, lon: 72.8777 } 
  })
  @IsOptional()
  @IsObject()
  location?: { lat: number; lon: number };
}

export class FeedbackDto {
  @ApiProperty({ description: 'Session ID', example: 'abc123' })
  @IsString()
  session_id!: string;

  @ApiProperty({ description: 'Original search query', example: 'cheap biryani' })
  @IsString()
  query!: string;

  @ApiProperty({ description: 'Clicked item ID', example: 12345 })
  @IsNumber()
  clicked_item_id!: number;

  @ApiProperty({ description: 'Position of clicked item (1-based)', example: 2 })
  @IsNumber()
  @Min(1)
  clicked_position!: number;

  @ApiPropertyOptional({ description: 'Item was added to cart', example: false, default: false })
  @IsOptional()
  @IsBoolean()
  added_to_cart?: boolean;

  @ApiPropertyOptional({ description: 'Item was ordered', example: false, default: false })
  @IsOptional()
  @IsBoolean()
  ordered?: boolean;

  @ApiPropertyOptional({ description: 'Order ID if ordered', example: 67890 })
  @IsOptional()
  @IsNumber()
  order_id?: number;

  @ApiPropertyOptional({ description: 'User satisfaction rating (1-5)', example: 5, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  satisfaction?: number;
}
