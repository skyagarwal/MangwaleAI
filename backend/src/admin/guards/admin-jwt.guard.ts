import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AdminRoleService } from '../services/admin-role.service';

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(private readonly adminRoleService: AdminRoleService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);
    const adminUser = this.adminRoleService.verifyToken(token);

    if (!adminUser) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    (request as any).adminUser = adminUser;
    return true;
  }
}
