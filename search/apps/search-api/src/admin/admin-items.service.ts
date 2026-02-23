import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPool, Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { QueryParamsDto } from './dto/query-params.dto';
import { Client } from '@opensearch-project/opensearch';

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

@Injectable()
export class AdminItemsService {
  private readonly logger = new Logger(AdminItemsService.name);
  private pool: Pool;
  private opensearchClient: Client;

  constructor(private readonly config: ConfigService) {
    // Initialize MySQL
    const mysqlHost = this.config.get<string>('MYSQL_HOST') || 'localhost';
    const mysqlPort = parseInt(this.config.get<string>('MYSQL_PORT') || '3306', 10);
    const mysqlUser = this.config.get<string>('MYSQL_USER') || 'root';
    const mysqlPassword = this.config.get<string>('MYSQL_PASSWORD') || 'admin123';
    const mysqlDatabase = this.config.get<string>('MYSQL_DATABASE') || 'mangwale_db';

    this.pool = createPool({
      host: mysqlHost,
      port: mysqlPort,
      user: mysqlUser,
      password: mysqlPassword,
      database: mysqlDatabase,
      connectionLimit: 10,
      waitForConnections: true,
    });

    // Initialize OpenSearch
    const node = this.config.get<string>('OPENSEARCH_HOST') || 'http://localhost:9200';
    const username = this.config.get<string>('OPENSEARCH_USERNAME');
    const password = this.config.get<string>('OPENSEARCH_PASSWORD');

    this.opensearchClient = new Client({
      node,
      auth: username && password ? { username, password } : undefined,
      ssl: { rejectUnauthorized: false },
    } as any);

    this.logger.log('✅ AdminItemsService initialized');
  }

  /**
   * Get all items with pagination, filtering, and search
   */
  async findAll(params: QueryParamsDto): Promise<PaginatedResponse<any>> {
    const {
      page = 1,
      limit = 20,
      search = '',
      sort_by = 'id',
      sort_order = 'DESC',
      status,
      module_id,
      store_id,
      category_id,
    } = params;

    const offset = (page - 1) * limit;

    // Build WHERE clause
    const conditions: string[] = [];
    const values: any[] = [];

    if (search) {
      conditions.push('(name LIKE ? OR description LIKE ?)');
      values.push(`%${search}%`, `%${search}%`);
    }

    if (status !== undefined) {
      conditions.push('status = ?');
      values.push(status);
    }

    if (module_id) {
      conditions.push('module_id = ?');
      values.push(module_id);
    }

    if (store_id) {
      conditions.push('store_id = ?');
      values.push(store_id);
    }

    if (category_id) {
      conditions.push('category_id = ?');
      values.push(category_id);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Count total
    const [[{ total }]] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM items ${whereClause}`,
      values,
    );

    // Get paginated data
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT * FROM items ${whereClause} ORDER BY ${sort_by} ${sort_order} LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    );

    return {
      data: rows,
      meta: {
        total: Number(total),
        page,
        limit,
        total_pages: Math.ceil(Number(total) / limit),
      },
    };
  }

  /**
   * Get single item by ID
   */
  async findOne(id: number): Promise<any> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM items WHERE id = ?', [id]);

    if (rows.length === 0) {
      throw new NotFoundException(`Item with ID ${id} not found`);
    }

    return rows[0];
  }

  /**
   * Create new item
   */
  async create(createItemDto: CreateItemDto): Promise<any> {
    try {
      const [result] = await this.pool.query<ResultSetHeader>('INSERT INTO items SET ?', [
        {
          ...createItemDto,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const newItem = await this.findOne(result.insertId);

      // Sync to OpenSearch
      await this.syncToOpenSearch(newItem);

      this.logger.log(`✅ Created item ID ${result.insertId}`);
      return newItem;
    } catch (error: any) {
      this.logger.error(`Failed to create item: ${error.message}`);
      throw new BadRequestException(`Failed to create item: ${error.message}`);
    }
  }

  /**
   * Update existing item
   */
  async update(id: number, updateItemDto: UpdateItemDto): Promise<any> {
    // Check if item exists
    await this.findOne(id);

    try {
      await this.pool.query('UPDATE items SET ?, updated_at = NOW() WHERE id = ?', [updateItemDto, id]);

      const updatedItem = await this.findOne(id);

      // Sync to OpenSearch
      await this.syncToOpenSearch(updatedItem);

      this.logger.log(`✅ Updated item ID ${id}`);
      return updatedItem;
    } catch (error: any) {
      this.logger.error(`Failed to update item: ${error.message}`);
      throw new BadRequestException(`Failed to update item: ${error.message}`);
    }
  }

  /**
   * Delete item
   */
  async remove(id: number): Promise<{ message: string }> {
    // Check if item exists
    const item = await this.findOne(id);

    await this.pool.query('DELETE FROM items WHERE id = ?', [id]);

    // Remove from OpenSearch
    await this.removeFromOpenSearch(item);

    this.logger.log(`✅ Deleted item ID ${id}`);
    return { message: `Item ID ${id} deleted successfully` };
  }

  /**
   * Bulk update items
   */
  async bulkUpdate(ids: number[], updateData: Partial<UpdateItemDto>): Promise<{ updated: number }> {
    if (ids.length === 0) {
      throw new BadRequestException('No IDs provided');
    }

    const placeholders = ids.map(() => '?').join(',');
    await this.pool.query(`UPDATE items SET ?, updated_at = NOW() WHERE id IN (${placeholders})`, [
      updateData,
      ...ids,
    ]);

    // Sync all updated items to OpenSearch
    const [items] = await this.pool.query<RowDataPacket[]>(`SELECT * FROM items WHERE id IN (${placeholders})`, ids);
    for (const item of items) {
      await this.syncToOpenSearch(item);
    }

    this.logger.log(`✅ Bulk updated ${ids.length} items`);
    return { updated: ids.length };
  }

  /**
   * Sync item to OpenSearch
   */
  private async syncToOpenSearch(item: any): Promise<void> {
    try {
      // Determine index name based on module
      let indexName = 'food_items_v4';
      if (item.module_id === 5 || item.module_id === 13) {
        indexName = 'ecom_items_v1';
      }

      // Only sync if status=1 and is_approved=1
      if (item.status !== 1 || item.is_approved !== 1) {
        this.logger.log(`⏭️  Skipping OpenSearch sync for item ${item.id} (status=${item.status}, is_approved=${item.is_approved})`);
        return;
      }

      // Fetch store data
      const [stores] = await this.pool.query<RowDataPacket[]>('SELECT * FROM stores WHERE id = ?', [item.store_id]);
      const store = stores[0];

      if (!store) {
        this.logger.warn(`⚠️  Store not found for item ${item.id}`);
        return;
      }

      // Fetch category data
      const [categories] = await this.pool.query<RowDataPacket[]>('SELECT * FROM categories WHERE id = ?', [
        item.category_id,
      ]);
      const category = categories[0];

      // Build OpenSearch document
      const doc: any = {
        id: item.id,
        name: item.name,
        description: item.description,
        image: item.image,
        category_id: item.category_id,
        category_name: category?.name || '',
        price: parseFloat(item.price),
        discount: parseFloat(item.discount),
        discount_type: item.discount_type,
        veg: item.veg === 1,
        status: item.status,
        store_id: item.store_id,
        store_name: store.name,
        module_id: item.module_id,
        avg_rating: parseFloat(item.avg_rating) || 0,
        rating_count: item.rating_count || 0,
        order_count: item.order_count || 0,
        recommended: item.recommended === 1,
        organic: item.organic === 1,
        available_time_starts: item.available_time_starts,
        available_time_ends: item.available_time_ends,
        location: store.latitude && store.longitude ? {
          lat: parseFloat(store.latitude),
          lon: parseFloat(store.longitude),
        } : null,
      };

      await this.opensearchClient.index({
        index: indexName,
        id: String(item.id),
        body: doc,
        refresh: true,
      });

      this.logger.log(`✅ Synced item ${item.id} to ${indexName}`);
    } catch (error: any) {
      this.logger.error(`Failed to sync item ${item.id} to OpenSearch: ${error.message}`);
    }
  }

  /**
   * Remove item from OpenSearch
   */
  private async removeFromOpenSearch(item: any): Promise<void> {
    try {
      let indexName = 'food_items_v4';
      if (item.module_id === 5 || item.module_id === 13) {
        indexName = 'ecom_items_v1';
      }

      await this.opensearchClient.delete({
        index: indexName,
        id: String(item.id),
      });

      this.logger.log(`✅ Removed item ${item.id} from ${indexName}`);
    } catch (error: any) {
      if (error.meta?.statusCode === 404) {
        this.logger.log(`⏭️  Item ${item.id} not found in OpenSearch, skipping`);
      } else {
        this.logger.error(`Failed to remove item ${item.id} from OpenSearch: ${error.message}`);
      }
    }
  }
}
