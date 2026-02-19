import { Controller, Get, Post, Delete, Body, Param, Logger, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PrismaService } from '../../database/prisma.service';
import * as crypto from 'crypto';

@Controller('admin/api-keys')
@UseGuards(AdminAuthGuard)
export class AdminApiKeysController {
  private readonly logger = new Logger(AdminApiKeysController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listKeys() {
    try {
      const rows = await this.prisma.$queryRaw<any[]>`
        SELECT * FROM bot_config WHERE key LIKE 'api_key.%' ORDER BY updated_at DESC
      `;
      const keys = rows.map(r => {
        const val = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
        return {
          id: r.key.replace('api_key.', ''),
          name: val.name || r.key,
          key: val.key ? val.key.substring(0, 8) + '...' + val.key.substring(val.key.length - 4) : '***',
          permissions: val.permissions || ['read'],
          createdAt: val.createdAt || r.created_at,
          lastUsed: val.lastUsed || null,
        };
      });
      return { success: true, data: keys };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  @Post()
  async createKey(@Body() body: { name: string; permissions?: string[] }) {
    const keyId = `key_${Date.now()}`;
    const apiKey = crypto.randomBytes(32).toString('hex');
    const value = JSON.stringify({
      name: body.name,
      key: apiKey,
      permissions: body.permissions || ['read'],
      createdAt: new Date().toISOString(),
    });

    await this.prisma.$executeRaw`
      INSERT INTO bot_config (key, value, category, description, created_at, updated_at)
      VALUES (${`api_key.${keyId}`}, ${value}, 'api_keys', ${`API Key: ${body.name}`}, NOW(), NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
    `;

    this.logger.log(`Created API key: ${body.name}`);
    return { success: true, id: keyId, key: apiKey, name: body.name };
  }

  @Delete(':id')
  async deleteKey(@Param('id') id: string) {
    const safeKey = `api_key.${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    await this.prisma.$executeRawUnsafe(`DELETE FROM bot_config WHERE key = $1`, safeKey);
    this.logger.log(`Deleted API key: ${id}`);
    return { success: true };
  }

  @Post(':id/rotate')
  async rotateKey(@Param('id') id: string) {
    const safeKey = `api_key.${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const newApiKey = crypto.randomBytes(32).toString('hex');

    try {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT value FROM bot_config WHERE key = $1`, safeKey,
      );
      if (rows.length === 0) return { success: false, error: 'Key not found' };

      const val = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      val.key = newApiKey;
      val.rotatedAt = new Date().toISOString();
      const newValue = JSON.stringify(val);

      await this.prisma.$executeRawUnsafe(
        `UPDATE bot_config SET value = $1, updated_at = NOW() WHERE key = $2`,
        newValue, safeKey,
      );

      return { success: true, key: newApiKey };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
