import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Application, ApplicationProvider } from '@prisma/client';
import {
  UnknownApplicationError,
  UnknownProviderError,
} from '../common/errors';
import { SecretCryptoService } from '../crypto/secret-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { SigningKeyService } from './signing-key.service';

export interface ApplicationWithRedirects extends Application {
  redirectUris: { id: string; uri: string }[];
}

@Injectable()
export class ApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly signingKeys: SigningKeyService,
  ) {}

  /**
   * The callback address registered with the upstream provider.
   *
   * Keyed by provider id rather than by slugs: an admin pastes this into the
   * Google or Discord console and cannot easily change it afterwards, so it
   * must survive renaming the application or the provider.
   */
  callbackUrl(applicationProviderId: string): string {
    return `${this.publicBaseUrl()}/auth/callback/${applicationProviderId}`;
  }

  /** This service's own origin, without a trailing slash. */
  publicBaseUrl(): string {
    return this.config
      .getOrThrow<string>('PUBLIC_BASE_URL')
      .replace(/\/+$/, '');
  }

  async findActiveBySlug(slug: string): Promise<ApplicationWithRedirects> {
    const application = await this.prisma.application.findFirst({
      where: { slug, isActive: true },
      include: {
        redirectUris: {
          select: { id: true, uri: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!application) {
      throw new UnknownApplicationError(
        `No active application with slug "${slug}"`,
      );
    }

    return application;
  }

  /** Public lookup accepting either identifier, for consumer convenience. */
  async findActiveBySlugOrClientId(identifier: string): Promise<Application> {
    const application = await this.prisma.application.findFirst({
      where: {
        isActive: true,
        OR: [{ slug: identifier }, { clientId: identifier }],
      },
    });

    if (!application) {
      throw new UnknownApplicationError(
        `No active application "${identifier}"`,
      );
    }

    return application;
  }

  async findEnabledProvider(
    applicationId: string,
    providerSlug: string,
  ): Promise<ApplicationProvider> {
    const provider = await this.prisma.applicationProvider.findFirst({
      where: { applicationId, slug: providerSlug, isEnabled: true },
    });

    if (!provider) {
      throw new UnknownProviderError(
        `No enabled provider "${providerSlug}" for this application`,
      );
    }

    return provider;
  }

  async findProviderById(id: string): Promise<ApplicationProvider> {
    const provider = await this.prisma.applicationProvider.findFirst({
      where: { id, isEnabled: true, application: { isActive: true } },
    });

    if (!provider) {
      throw new UnknownProviderError(`No enabled provider with id "${id}"`);
    }

    return provider;
  }

  async findById(id: string): Promise<Application> {
    const application = await this.prisma.application.findUnique({
      where: { id },
    });

    if (!application) {
      throw new UnknownApplicationError(`No application with id "${id}"`);
    }

    return application;
  }

  /** Login options shown on the public sign-in page. */
  async listEnabledProviders(
    applicationId: string,
  ): Promise<
    Array<{ slug: string; displayName: string; iconName: string | null }>
  > {
    return this.prisma.applicationProvider.findMany({
      where: { applicationId, isEnabled: true },
      select: { slug: true, displayName: true, iconName: true },
      orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
    });
  }

  /**
   * Creates an application together with its first signing key, so a freshly
   * registered application can mint tokens without any further setup.
   */
  async create(input: {
    slug: string;
    name: string;
    description?: string | null;
    tokenTtlSeconds?: number;
    allowEmailLinking?: boolean;
  }): Promise<Application> {
    const signingKey = await this.signingKeys.generate();

    return this.prisma.application.create({
      data: {
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        clientId: SecretCryptoService.randomToken(24),
        tokenTtlSeconds: input.tokenTtlSeconds ?? 3600,
        allowEmailLinking: input.allowEmailLinking ?? false,
        signingKeys: { create: signingKey },
      },
    });
  }
}
