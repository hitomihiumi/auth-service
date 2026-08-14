import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AdminUser } from '@prisma/client';
import * as argon2 from 'argon2';
import { SecretCryptoService } from '../crypto/secret-crypto.service';
import { PrismaService } from '../prisma/prisma.service';

export const ADMIN_SESSION_COOKIE = 'admin_session';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** Refresh the expiry once a session is more than half spent. */
const SLIDING_THRESHOLD_MS = SESSION_TTL_MS / 2;

/**
 * Hash of a value that matches no account. Verifying against it on the miss
 * path keeps login timing similar whether or not the address exists.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHR2YWx1ZXg$m2Wr7BvVLBTKPPq1KH0jMkuNRkKCLYGYFQ8kPwNHqfo';

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  static hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  /**
   * Verifies credentials and opens a session.
   *
   * The session token is random and stored only as a digest, so a database leak
   * does not hand over live sessions, and revocation is immediate — neither of
   * which a stateless JWT cookie would give.
   */
  async login(params: {
    email: string;
    password: string;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<{ token: string; expiresAt: Date; admin: AdminUser }> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: params.email.toLowerCase() },
    });

    const passwordMatches = await this.verifyPassword(
      admin?.passwordHash ?? DUMMY_HASH,
      params.password,
    );

    if (!admin || !admin.isActive || !passwordMatches) {
      this.logger.warn(`Failed admin login for "${params.email}"`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = SecretCryptoService.randomToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.prisma.$transaction([
      this.prisma.adminSession.create({
        data: {
          adminUserId: admin.id,
          tokenHash: SecretCryptoService.sha256(token),
          userAgent: params.userAgent?.slice(0, 512) ?? null,
          ipAddress: params.ipAddress ?? null,
          expiresAt,
        },
      }),
      this.prisma.adminUser.update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    this.logger.log(`Admin ${admin.email} signed in`);

    return { token, expiresAt, admin };
  }

  async resolveSession(token: string | undefined): Promise<AdminUser | null> {
    if (!token) {
      return null;
    }

    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash: SecretCryptoService.sha256(token) },
      include: { adminUser: true },
    });

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now() ||
      !session.adminUser.isActive
    ) {
      return null;
    }

    const remaining = session.expiresAt.getTime() - Date.now();
    if (remaining < SLIDING_THRESHOLD_MS) {
      await this.prisma.adminSession.update({
        where: { id: session.id },
        data: { expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
      });
    }

    return session.adminUser;
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }

    await this.prisma.adminSession.updateMany({
      where: { tokenHash: SecretCryptoService.sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Changing a password revokes every other session for that admin. */
  async changePassword(
    admin: AdminUser,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (!(await this.verifyPassword(admin.passwordHash, currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.prisma.$transaction([
      this.prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          passwordHash: await AdminAuthService.hashPassword(newPassword),
        },
      }),
      this.prisma.adminSession.updateMany({
        where: { adminUserId: admin.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    this.logger.log(`Admin ${admin.email} changed their password`);
  }

  private async verifyPassword(
    hash: string,
    password: string,
  ): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
