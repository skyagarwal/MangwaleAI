import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPool, Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { QueryParamsDto } from './dto/query-params.dto';
import { PaginatedResponse } from './admin-items.service';

@Injectable()
export class AdminCategoriesService {
  private readonly logger = new Logger(AdminCategoriesService.name);
  private pool: Pool;

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

    this.logger.log('✅ AdminCategoriesService initialized');
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
      conditions.push('name LIKE ?');
      values.push(`%${search}%`);
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
      `SELECT COUNT(*) as total FROM categories ${whereClause}`,
      values,
    );

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT * FROM categories ${whereClause} ORDER BY ${sort_by} ${sort_order} LIMIT ? OFFSET ?`,
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
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM categories WHERE id = ?', [id]);

    if (rows.length === 0) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return rows[0];
  }

  async create(createCategoryDto: CreateCategoryDto): Promise<any> {
    try {
      // Auto-generate slug if not provided
      if (!createCategoryDto.slug) {
        createCategoryDto.slug = createCategoryDto.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      }

      const [result] = await this.pool.query<ResultSetHeader>('INSERT INTO categories SET ?', [
        {
          ...createCategoryDto,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const newCategory = await this.findOne(result.insertId);

      this.logger.log(`✅ Created category ID ${result.insertId}`);
      return newCategory;
    } catch (error: any) {
      this.logger.error(`Failed to create category: ${error.message}`);
      throw new BadRequestException(`Failed to create category: ${error.message}`);
    }
  }

  async update(id: number, updateCategoryDto: UpdateCategoryDto): Promise<any> {
    await this.findOne(id);

    try {
      await this.pool.query('UPDATE categories SET ?, updated_at = NOW() WHERE id = ?', [updateCategoryDto, id]);

      const updatedCategory = await this.findOne(id);

      this.logger.log(`✅ Updated category ID ${id}`);
      return updatedCategory;
    } catch (error: any) {
      this.logger.error(`Failed to update category: ${error.message}`);
      throw new BadRequestException(`Failed to update category: ${error.message}`);
    }
  }

  async remove(id: number): Promise<{ message: string }> {
    await this.findOne(id);

    // Check for dependent items
    const [[{ count }]] = await this.pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM items WHERE category_id = ?',
      [id],
    );

    if (Number(count) > 0) {
      throw new BadRequestException(
        `Cannot delete category with ${count} items. Please delete or reassign items first.`,
      );
    }

    // Check for child categories
    const [[{ childCount }]] = await this.pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) as childCount FROM categories WHERE parent_id = ?',
      [id],
    );

    if (Number(childCount) > 0) {
      throw new BadRequestException(
        `Cannot delete category with ${childCount} child categories. Please delete child categories first.`,
      );
    }

    await this.pool.query('DELETE FROM categories WHERE id = ?', [id]);

    this.logger.log(`✅ Deleted category ID ${id}`);
    return { message: `Category ID ${id} deleted successfully` };
  }

  /**
   * Get category tree with parent-child relationships
   */
  async getCategoryTree(module_id?: number): Promise<any[]> {
    const whereClause = module_id ? 'WHERE module_id = ?' : '';
    const values = module_id ? [module_id] : [];

    const [categories] = await this.pool.query<RowDataPacket[]>(
      `SELECT * FROM categories ${whereClause} ORDER BY position, priority DESC, name`,
      values,
    );

    // Build tree structure
    const categoryMap = new Map();
    const tree: any[] = [];

    // First pass: create map of all categories
    categories.forEach((cat: any) => {
      categoryMap.set(cat.id, { ...cat, children: [] });
    });

    // Second pass: build tree structure
    categories.forEach((cat: any) => {
      const category = categoryMap.get(cat.id);
      if (cat.parent_id === 0) {
        tree.push(category);
      } else {
        const parent = categoryMap.get(cat.parent_id);
        if (parent) {
          parent.children.push(category);
        } else {
          // If parent not found, add to root
          tree.push(category);
        }
      }
    });

    return tree;
  }
}
