import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { AdminItemsService } from './admin-items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { QueryParamsDto } from './dto/query-params.dto';

@Controller('admin/items')
@ApiTags('Admin - Items Management')
export class AdminItemsController {
  constructor(private readonly itemsService: AdminItemsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all items with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Returns paginated items list' })
  async findAll(@Query() params: QueryParamsDto) {
    return this.itemsService.findAll(params);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single item by ID' })
  @ApiParam({ name: 'id', type: 'number', description: 'Item ID' })
  @ApiResponse({ status: 200, description: 'Returns item details' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.itemsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new item' })
  @ApiResponse({ status: 201, description: 'Item created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async create(@Body() createItemDto: CreateItemDto) {
    return this.itemsService.create(createItemDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update existing item' })
  @ApiParam({ name: 'id', type: 'number', description: 'Item ID' })
  @ApiResponse({ status: 200, description: 'Item updated successfully' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() updateItemDto: UpdateItemDto) {
    return this.itemsService.update(id, updateItemDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete item' })
  @ApiParam({ name: 'id', type: 'number', description: 'Item ID' })
  @ApiResponse({ status: 200, description: 'Item deleted successfully' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.itemsService.remove(id);
  }

  @Post('bulk-update')
  @ApiOperation({ summary: 'Bulk update multiple items' })
  @ApiResponse({ status: 200, description: 'Items updated successfully' })
  async bulkUpdate(@Body() body: { ids: number[]; updateData: Partial<UpdateItemDto> }) {
    return this.itemsService.bulkUpdate(body.ids, body.updateData);
  }
}
