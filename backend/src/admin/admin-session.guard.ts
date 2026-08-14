import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminUser } from '@prisma/client';
import type { Request } from 'express';
import { ADMIN_SESSION_COOKIE, AdminAuthService } from './admin-auth.service';

export interface RequestWithAdmin extends Request {
  admin?: AdminUser;
}

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private readonly adminAuth: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAdmin>();
    const token = (request.cookies as Record<string, string> | undefined)?.[
      ADMIN_SESSION_COOKIE
    ];

    const admin = await this.adminAuth.resolveSession(token);

    if (!admin) {
      throw new UnauthorizedException('Admin session required');
    }

    request.admin = admin;
    return true;
  }
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminUser => {
    const request = context.switchToHttp().getRequest<RequestWithAdmin>();

    if (!request.admin) {
      throw new UnauthorizedException('Admin session required');
    }

    return request.admin;
  },
);
