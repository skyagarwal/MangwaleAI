import { Controller, Get, Post, Put, Delete, Body, Param, Logger, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PrismaService } from '../../database/prisma.service';

@Controller('webhooks')
@UseGuards(AdminAuthGuard)
export class AdminWebhooksController {
  private readonly logger = new Logger(AdminWebhooksController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async listWebhooks() {
    try {
      const rows = await this.prisma.$queryRaw<any[]>`
        SELECT * FROM bot_config WHERE key LIKE 'webhook.%' ORDER BY updated_at DESC
      `;
      const webhooks = rows.map(r => {
        const val = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
        return { id: r.key.replace('webhook.', ''), ...val };
      });
      return { success: true, data: webhooks };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  @Post()
  async createWebhook(@Body() body: { name: string; url: string; events: string[]; active?: boolean }) {
    const id = `wh_${Date.now()}`;
    const value = JSON.stringify({
      name: body.name,
      url: body.url,
      events: body.events || [],
      active: body.active !== false,
      createdAt: new Date().toISOString(),
    });

    await this.prisma.$executeRaw`
      INSERT INTO bot_config (key, value, category, description, created_at, updated_at)
      VALUES (${`webhook.${id}`}, ${value}, 'webhooks', ${`Webhook: ${body.name}`}, NOW(), NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
    `;

    this.logger.log(`Created webhook: ${body.name} -> ${body.url}`);
    return { success: true, id, name: body.name };
  }

  @Put(':id')
  async updateWebhook(@Param('id') id: string, @Body() body: any) {
    const safeKey = `webhook.${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const value = JSON.stringify({ ...body, updatedAt: new Date().toISOString() });
    await this.prisma.$executeRawUnsafe(
      `UPDATE bot_config SET value = $1, updated_at = NOW() WHERE key = $2`,
      value, safeKey,
    );
    return { success: true };
  }

  @Delete(':id')
  async deleteWebhook(@Param('id') id: string) {
    const safeKey = `webhook.${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    await this.prisma.$executeRawUnsafe(`DELETE FROM bot_config WHERE key = $1`, safeKey);
    this.logger.log(`Deleted webhook: ${id}`);
    return { success: true };
  }
}
