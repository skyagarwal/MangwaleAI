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
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { AdminStoresService } from './admin-stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { QueryParamsDto } from './dto/query-params.dto';

@Controller('admin/stores')
@ApiTags('Admin - Stores Management')
export class AdminStoresController {
  constructor(private readonly storesService: AdminStoresService) {}

  @Get()
  @ApiOperation({ summary: 'Get all stores with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Returns paginated stores list' })
  async findAll(@Query() params: QueryParamsDto) {
    return this.storesService.findAll(params);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single store by ID' })
  @ApiParam({ name: 'id', type: 'number', description: 'Store ID' })
  @ApiResponse({ status: 200, description: 'Returns store details' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.storesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new store' })
  @ApiResponse({ status: 201, description: 'Store created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async create(@Body() createStoreDto: CreateStoreDto) {
    return this.storesService.create(createStoreDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update existing store' })
  @ApiParam({ name: 'id', type: 'number', description: 'Store ID' })
  @ApiResponse({ status: 200, description: 'Store updated successfully' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() updateStoreDto: UpdateStoreDto) {
    return this.storesService.update(id, updateStoreDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete store' })
  @ApiParam({ name: 'id', type: 'number', description: 'Store ID' })
  @ApiResponse({ status: 200, description: 'Store deleted successfully' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  @ApiResponse({ status: 400, description: 'Cannot delete store with items' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.storesService.remove(id);
  }
}
