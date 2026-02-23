import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPool, Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { QueryParamsDto } from './dto/query-params.dto';
import { Client } from '@opensearch-project/opensearch';
import { PaginatedResponse } from './admin-items.service';

@Injectable()
export class AdminStoresService {
  private readonly logger = new Logger(AdminStoresService.name);
  private pool: Pool;
  private opensearchClient: Client;

  constructor(private readonly config: ConfigService) {
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

    const node = this.config.get<string>('OPENSEARCH_HOST') || 'http://localhost:9200';
    const username = this.config.get<string>('OPENSEARCH_USERNAME');
    const password = this.config.get<string>('OPENSEARCH_PASSWORD');

    this.opensearchClient = new Client({
      node,
      auth: username && password ? { username, password } : undefined,
      ssl: { rejectUnauthorized: false },
    } as any);

    this.logger.log('✅ AdminStoresService initialized');
  }

  async findAll(params: QueryParamsDto): Promise<PaginatedResponse<any>> {
    const {
      page = 1,
      limit = 20,
      search = '',
      sort_by = 'id',
      sort_order = 'DESC',
      status,
      module_id,
    } = params;

    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const values: any[] = [];

    if (search) {
      conditions.push('(name LIKE ? OR address LIKE ? OR phone LIKE ?)');
      values.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status !== undefined) {
      conditions.push('status = ?');
      values.push(status);
    }

    if (module_id) {
      conditions.push('module_id = ?');
      values.push(module_id);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const [[{ total }]] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total FROM stores ${whereClause}`,
      values,
    );

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT * FROM stores ${whereClause} ORDER BY ${sort_by} ${sort_order} LIMIT ? OFFSET ?`,
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

  async findOne(id: number): Promise<any> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM stores WHERE id = ?', [id]);

    if (rows.length === 0) {
      throw new NotFoundException(`Store with ID ${id} not found`);
    }

    return rows[0];
  }

  async create(createStoreDto: CreateStoreDto): Promise<any> {
    try {
      const [result] = await this.pool.query<ResultSetHeader>('INSERT INTO stores SET ?', [
        {
          ...createStoreDto,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const newStore = await this.findOne(result.insertId);
      await this.syncToOpenSearch(newStore);

      this.logger.log(`✅ Created store ID ${result.insertId}`);
      return newStore;
    } catch (error: any) {
      this.logger.error(`Failed to create store: ${error.message}`);
      throw new BadRequestException(`Failed to create store: ${error.message}`);
    }
  }

  async update(id: number, updateStoreDto: UpdateStoreDto): Promise<any> {
    await this.findOne(id);

    try {
      await this.pool.query('UPDATE stores SET ?, updated_at = NOW() WHERE id = ?', [updateStoreDto, id]);

      const updatedStore = await this.findOne(id);
      await this.syncToOpenSearch(updatedStore);

      this.logger.log(`✅ Updated store ID ${id}`);
      return updatedStore;
    } catch (error: any) {
      this.logger.error(`Failed to update store: ${error.message}`);
      throw new BadRequestException(`Failed to update store: ${error.message}`);
    }
  }

  async remove(id: number): Promise<{ message: string }> {
    const store = await this.findOne(id);

    // Check for dependent items
    const [[{ count }]] = await this.pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM items WHERE store_id = ?',
      [id],
    );

    if (Number(count) > 0) {
      throw new BadRequestException(
        `Cannot delete store with ${count} items. Please delete or reassign items first.`,
      );
    }

    await this.pool.query('DELETE FROM stores WHERE id = ?', [id]);
    await this.removeFromOpenSearch(store);

    this.logger.log(`✅ Deleted store ID ${id}`);
    return { message: `Store ID ${id} deleted successfully` };
  }

  private async syncToOpenSearch(store: any): Promise<void> {
    try {
      let indexName = 'food_stores_v6';
      if (store.module_id === 5 || store.module_id === 13) {
        indexName = 'ecom_stores_v1';
      }

      if (store.status !== 1) {
        this.logger.log(`⏭️  Skipping OpenSearch sync for store ${store.id} (status=${store.status})`);
        return;
      }

      const doc: any = {
        id: store.id,
        name: store.name,
        phone: store.phone,
        email: store.email,
        logo: store.logo,
        cover_photo: store.cover_photo,
        address: store.address,
        minimum_order: parseFloat(store.minimum_order),
        delivery_time: store.delivery_time,
        avg_rating: parseFloat(store.rating) || 0,
        rating_count: store.rating_count || 0,
        order_count: store.order_count || 0,
        veg: store.veg === 1,
        non_veg: store.non_veg === 1,
        module_id: store.module_id,
        status: store.status,
        active: store.active,
        free_delivery: store.free_delivery === 1,
        opening_time: store.opening_time,
        closing_time: store.closing_time,
        location: store.latitude && store.longitude ? {
          lat: parseFloat(store.latitude),
          lon: parseFloat(store.longitude),
        } : null,
      };

      await this.opensearchClient.index({
        index: indexName,
        id: String(store.id),
        body: doc,
        refresh: true,
      });

      this.logger.log(`✅ Synced store ${store.id} to ${indexName}`);
    } catch (error: any) {
      this.logger.error(`Failed to sync store ${store.id} to OpenSearch: ${error.message}`);
    }
  }

  private async removeFromOpenSearch(store: any): Promise<void> {
    try {
      let indexName = 'food_stores_v6';
      if (store.module_id === 5 || store.module_id === 13) {
        indexName = 'ecom_stores_v1';
      }

      await this.opensearchClient.delete({
        index: indexName,
        id: String(store.id),
      });

      this.logger.log(`✅ Removed store ${store.id} from ${indexName}`);
    } catch (error: any) {
      if (error.meta?.statusCode === 404) {
        this.logger.log(`⏭️  Store ${store.id} not found in OpenSearch, skipping`);
      } else {
        this.logger.error(`Failed to remove store ${store.id} from OpenSearch: ${error.message}`);
      }
    }
  }
}
