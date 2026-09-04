import { Injectable, Logger } from '@nestjs/common';
import { Application, ApplicationProvider, Prisma, User } from '@prisma/client';
import {
  EmailAlreadyRegisteredError,
  UnknownUserError,
  UserBlockedError,
} from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { NormalizedProfile } from '../oauth/profile';

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Re-reads a user part-way through a login, for the steps that happen after
   * the provider has answered — an account blocked in between must not still
   * be handed a token.
   */
  async findActiveUser(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnknownUserError('This account no longer exists');
    }

    if (user.isBlocked) {
      throw new UserBlockedError('This account has been blocked');
    }

    return user;
  }

  /**
   * Resolves a provider profile to a local user, creating one if needed.
   *
   * Replaces the previous read-then-write pair, which could interleave under
   * concurrent logins and had no unique constraint able to catch the result.
   * The `(applicationProviderId, providerAccountId)` index now makes a duplicate
   * impossible; a loser in that race retries once and reads the winner's row.
   */
  async resolveUser(
    application: Application,
    provider: ApplicationProvider,
    profile: NormalizedProfile,
  ): Promise<User> {
    try {
      return await this.runResolve(application, provider, profile);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.warn(
          `Concurrent first login for provider ${provider.slug}; retrying resolution`,
        );
        return this.runResolve(application, provider, profile);
      }
      throw error;
    }
  }

  private async runResolve(
    application: Application,
    provider: ApplicationProvider,
    profile: NormalizedProfile,
  ): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.identity.findUnique({
        where: {
          applicationProviderId_providerAccountId: {
            applicationProviderId: provider.id,
            providerAccountId: profile.providerAccountId,
          },
        },
        include: { user: true },
      });

      if (existing) {
        return this.refreshExisting(tx, existing.id, existing.user, profile);
      }

      return this.createOrLink(tx, application, provider, profile);
    });
  }

  /** A returning user: refresh the mutable profile fields and the login stamp. */
  private async refreshExisting(
    tx: Prisma.TransactionClient,
    identityId: string,
    user: User,
    profile: NormalizedProfile,
  ): Promise<User> {
    if (user.isBlocked) {
      throw new UserBlockedError('This account has been blocked');
    }

    await tx.identity.update({
      where: { id: identityId },
      data: { rawProfile: profile.raw as Prisma.InputJsonValue },
    });

    // The address is only refreshed when the provider vouches for it and no
    // other user in this application already holds it.
    const canUpdateEmail =
      profile.email !== null &&
      profile.emailVerified &&
      profile.email !== user.email &&
      !(await this.emailTaken(tx, user.applicationId, profile.email, user.id));

    return tx.user.update({
      where: { id: user.id },
      data: {
        username: profile.username ?? user.username,
        avatarUrl: profile.avatarUrl ?? user.avatarUrl,
        lastLoginAt: new Date(),
        ...(canUpdateEmail
          ? { email: profile.email, emailVerified: true }
          : {}),
      },
    });
  }

  /**
   * A first login through this provider. Either attaches to an existing user of
   * the same application or creates one.
   */
  private async createOrLink(
    tx: Prisma.TransactionClient,
    application: Application,
    provider: ApplicationProvider,
    profile: NormalizedProfile,
  ): Promise<User> {
    const identityData = {
      applicationProviderId: provider.id,
      providerAccountId: profile.providerAccountId,
      rawProfile: profile.raw as Prisma.InputJsonValue,
    };

    if (profile.email) {
      const owner = await tx.user.findUnique({
        where: {
          applicationId_email: {
            applicationId: application.id,
            email: profile.email,
          },
        },
      });

      if (owner) {
        // Linking on an unverified address would let anyone who can assert an
        // arbitrary email at some provider take over an existing account.
        if (!application.allowEmailLinking || !profile.emailVerified) {
          throw new EmailAlreadyRegisteredError(
            `${profile.email} is already registered in application ${application.slug}`,
          );
        }

        if (owner.isBlocked) {
          throw new UserBlockedError('This account has been blocked');
        }

        await tx.identity.create({
          data: { ...identityData, userId: owner.id },
        });

        return tx.user.update({
          where: { id: owner.id },
          data: {
            username: owner.username ?? profile.username,
            avatarUrl: owner.avatarUrl ?? profile.avatarUrl,
            lastLoginAt: new Date(),
          },
        });
      }
    }

    return tx.user.create({
      data: {
        applicationId: application.id,
        email: profile.email,
        emailVerified: profile.emailVerified,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        lastLoginAt: new Date(),
        identities: { create: identityData },
      },
    });
  }

  private async emailTaken(
    tx: Prisma.TransactionClient,
    applicationId: string,
    email: string,
    exceptUserId: string,
  ): Promise<boolean> {
    const holder = await tx.user.findUnique({
      where: { applicationId_email: { applicationId, email } },
      select: { id: true },
    });

    return holder !== null && holder.id !== exceptUserId;
  }
}
