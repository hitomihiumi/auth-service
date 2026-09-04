import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Application, User } from '@prisma/client';
import type { Request } from 'express';
import { ApplicationService } from '../applications/application.service';
import { TokenService } from '../applications/token.service';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthenticatedUser {
  user: User;
  application: Application;
}

export interface RequestWithUser extends Request {
  authenticated?: AuthenticatedUser;
}

/**
 * Authenticates an end user by the access token this service issued them.
 *
 * Managing your own second factor is the one thing a user does here directly,
 * rather than through the consumer application, so it needs an identity of its
 * own — the admin session cookie belongs to operators and says nothing about
 * which user is calling.
 */
@Injectable()
export class UserTokenGuard implements CanActivate {
  constructor(
    private readonly applications: ApplicationService,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('A bearer token is required');
    }

    const token = header.slice('Bearer '.length).trim();

    // The audience selects the key set, so it has to be read out of the token
    // before anything about it can be trusted — hence a decode, then a verify
    // against the keys of the application it names.
    const application = await this.resolveApplication(readAudience(token));

    let subject: string;
    try {
      subject = (await this.tokens.verify(token, application)).sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: subject, applicationId: application.id },
    });

    if (!user || user.isBlocked) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    request.authenticated = { user, application };
    return true;
  }

  private async resolveApplication(audience: string): Promise<Application> {
    try {
      return await this.applications.findActiveBySlugOrClientId(audience);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}

/**
 * Reads `aud` without verifying anything. Safe only because the value is used
 * to choose which public keys to check the signature against — a forged one
 * selects keys the token cannot possibly verify under.
 */
function readAudience(token: string): string {
  const [, payload] = token.split('.');

  try {
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { aud?: unknown };

    if (typeof claims.aud === 'string') {
      return claims.aud;
    }
  } catch {
    // Falls through to the same rejection as a missing audience.
  }

  throw new UnauthorizedException('Invalid or expired token');
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    if (!request.authenticated) {
      throw new UnauthorizedException('A bearer token is required');
    }

    return request.authenticated;
  },
);
