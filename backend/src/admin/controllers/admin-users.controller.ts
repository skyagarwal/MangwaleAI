import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { AdminRoleService, AdminRole } from '../services/admin-role.service';
import { AdminActivityLogService } from '../services/admin-activity-log.service';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { CreateAdminDto, UpdateRoleDto, ActivityLogQueryDto } from '../dto/admin-users.dto';

@Controller('admin/users')
@UseGuards(AdminAuthGuard)
export class AdminUsersController {
  private readonly logger = new Logger(AdminUsersController.name);

  constructor(
    private readonly adminRoleService: AdminRoleService,
    private readonly activityLog: AdminActivityLogService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /api/admin/users
   * List all admin users
   */
  @Get()
  async listAdmins(@Req() req: Request) {
    const users = await this.adminRoleService.listAdmins();
    return { success: true, users };
  }

  /**
   * GET /api/admin/users/activity
   * Get activity log with pagination
   */
  @Get('activity')
  async getActivityLog(@Query() query: ActivityLogQueryDto) {
    const limit = query.limit || 50;
    const offset = query.offset || 0;

    let logs: any[];
    let total: number;

    if (query.action) {
      logs = await this.prisma.$queryRaw<any[]>`
        SELECT al.*, au.name as admin_name, au.email as admin_email
        FROM admin_activity_log al
        LEFT JOIN admin_users au ON al.admin_id = au.id
        WHERE al.action = ${query.action}
        ORDER BY al.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const countResult = await this.prisma.$queryRaw<any[]>`
        SELECT COUNT(*)::int as count FROM admin_activity_log WHERE action = ${query.action}
      `;
      total = countResult[0]?.count || 0;
    } else {
      logs = await this.prisma.$queryRaw<any[]>`
        SELECT al.*, au.name as admin_name, au.email as admin_email
        FROM admin_activity_log al
        LEFT JOIN admin_users au ON al.admin_id = au.id
        ORDER BY al.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const countResult = await this.prisma.$queryRaw<any[]>`
        SELECT COUNT(*)::int as count FROM admin_activity_log
      `;
      total = countResult[0]?.count || 0;
    }

    return { success: true, logs, total };
  }

  /**
   * POST /api/admin/users
   * Create a new admin user (super_admin only)
   */
  @Post()
  async createAdmin(@Body() dto: CreateAdminDto, @Req() req: Request) {
    const adminUser = (req as any).adminUser;
    const ip = req.ip;
    const ua = req.headers['user-agent'] as string;

    try {
      const newUser = await this.adminRoleService.createAdminUser(
        dto.email,
        dto.password,
        dto.name,
        dto.role as AdminRole,
        adminUser?.id || 'api-key',
      );

      await this.activityLog.log(
        adminUser?.id || null,
        'create_admin' as any,
        'users',
        { email: dto.email, role: dto.role },
        ip,
        ua,
      );

      return { success: true, user: newUser };
    } catch (error) {
      this.logger.error(`Failed to create admin: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * PUT /api/admin/users/:id/role
   * Update admin role (super_admin only)
   */
  @Put(':id/role')
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @Req() req: Request,
  ) {
    const adminUser = (req as any).adminUser;
    const ip = req.ip;
    const ua = req.headers['user-agent'] as string;

    try {
      await this.adminRoleService.updateRole(
        id,
        dto.role as AdminRole,
        adminUser?.id || 'api-key',
      );

      await this.activityLog.log(
        adminUser?.id || null,
        'update_role' as any,
        'users',
        { targetId: id, newRole: dto.role },
        ip,
        ua,
      );

      return { success: true, message: 'Role updated successfully' };
    } catch (error) {
      this.logger.error(`Failed to update role: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * PUT /api/admin/users/:id/deactivate
   * Deactivate an admin user (super_admin only)
   */
  @Put(':id/deactivate')
  async deactivateAdmin(@Param('id') id: string, @Req() req: Request) {
    const adminUser = (req as any).adminUser;
    const ip = req.ip;
    const ua = req.headers['user-agent'] as string;

    try {
      await this.adminRoleService.deactivateAdmin(
        id,
        adminUser?.id || 'api-key',
      );

      await this.activityLog.log(
        adminUser?.id || null,
        'deactivate_admin' as any,
        'users',
        { targetId: id },
        ip,
        ua,
      );

      return { success: true, message: 'Admin deactivated successfully' };
    } catch (error) {
      this.logger.error(`Failed to deactivate admin: ${error.message}`);
      return { success: false, message: error.message };
    }
  }
}
