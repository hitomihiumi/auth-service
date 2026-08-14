import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProviderKind } from '@prisma/client';
import { ApplicationService } from '../applications/application.service';
import { SigningKeyService } from '../applications/signing-key.service';
import { RedirectUriValidator } from '../auth/redirect-uri.validator';
import { InvalidRedirectUriError } from '../common/errors';
import { SecretCryptoService } from '../crypto/secret-crypto.service';
import { findPreset } from '../oauth/presets';
import { PrismaService } from '../prisma/prisma.service';
import {
  applicationSelect,
  providerSelect,
  userSelect,
  withProviderExtras,
} from './admin.mapper';
import {
  CreateApplicationDto,
  CreateRedirectUriDto,
  ListQueryDto,
  UpdateApplicationDto,
} from './dto/application.dto';
import { CreateProviderDto, UpdateProviderDto } from './dto/provider.dto';

const DEFAULT_PAGE_SIZE = 25;

@Injectable()
export class AdminApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applications: ApplicationService,
    private readonly signingKeys: SigningKeyService,
    private readonly redirectUris: RedirectUriValidator,
    private readonly crypto: SecretCryptoService,
  ) {}

  async list(query: ListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where = query.q
      ? {
          OR: [
            { slug: { contains: query.q, mode: 'insensitive' as const } },
            { name: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.application.findMany({
        where,
        select: {
          ...applicationSelect,
          _count: { select: { users: true, providers: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.application.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async get(id: string) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      select: {
        ...applicationSelect,
        redirectUris: {
          select: { id: true, uri: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
        providers: { select: providerSelect, orderBy: { sortOrder: 'asc' } },
        signingKeys: {
          select: {
            id: true,
            kid: true,
            algorithm: true,
            isActive: true,
            createdAt: true,
            expiresAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { users: true } },
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return {
      ...application,
      jwksUrl: `${this.publicBase()}/auth/${application.slug}/.well-known/jwks.json`,
      loginUrlTemplate:
        `${this.publicBase()}/auth/${application.slug}/{providerSlug}/start` +
        `?redirect_uri={redirectUri}`,
      providers: application.providers.map((provider) =>
        withProviderExtras(
          provider,
          this.applications.callbackUrl(provider.id),
        ),
      ),
    };
  }

  async create(dto: CreateApplicationDto) {
    const existing = await this.prisma.application.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException(`Slug "${dto.slug}" is already taken`);
    }

    const application = await this.applications.create(dto);
    return this.get(application.id);
  }

  async update(id: string, dto: UpdateApplicationDto) {
    await this.ensureExists(id);

    await this.prisma.application.update({ where: { id }, data: dto });
    return this.get(id);
  }

  /**
   * Deletes an application and, by cascade, its users, identities, providers and
   * keys — hence the confirmation requirement at the controller.
   */
  async remove(id: string): Promise<void> {
    await this.ensureExists(id);
    await this.prisma.application.delete({ where: { id } });
  }

  async rotateSigningKey(id: string) {
    const application = await this.ensureExists(id);
    await this.signingKeys.rotate(id, application.tokenTtlSeconds);
    return this.get(id);
  }

  async addRedirectUri(applicationId: string, dto: CreateRedirectUriDto) {
    await this.ensureExists(applicationId);

    let uri: string;
    try {
      uri = this.redirectUris.normalizeForRegistration(dto.uri);
    } catch (error) {
      throw error instanceof InvalidRedirectUriError
        ? new BadRequestException(error.message)
        : error;
    }

    const existing = await this.prisma.applicationRedirectUri.findUnique({
      where: { applicationId_uri: { applicationId, uri } },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException(`"${uri}" is already registered`);
    }

    return this.prisma.applicationRedirectUri.create({
      data: { applicationId, uri },
      select: { id: true, uri: true, createdAt: true },
    });
  }

  async removeRedirectUri(applicationId: string, uriId: string): Promise<void> {
    const { count } = await this.prisma.applicationRedirectUri.deleteMany({
      where: { id: uriId, applicationId },
    });

    if (count === 0) {
      throw new NotFoundException('Redirect URI not found');
    }
  }

  async createProvider(applicationId: string, dto: CreateProviderDto) {
    await this.ensureExists(applicationId);

    const existing = await this.prisma.applicationProvider.findUnique({
      where: { applicationId_slug: { applicationId, slug: dto.slug } },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException(
        `Provider slug "${dto.slug}" is already used in this application`,
      );
    }

    const preset = findPreset(dto.kind);

    const provider = await this.prisma.applicationProvider.create({
      data: {
        applicationId,
        kind: dto.kind,
        slug: dto.slug,
        displayName: dto.displayName,
        iconName: dto.iconName ?? preset?.iconName ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isEnabled: dto.isEnabled ?? true,
        clientId: dto.clientId,
        clientSecretEnc: this.crypto.seal(dto.clientSecret),
        clientSecretLast4: SecretCryptoService.last4(dto.clientSecret),
        scopes: dto.scopes ?? [],
        usePkce: dto.usePkce ?? preset?.usePkce ?? true,
        // Preset endpoints come from the catalog at request time, so storing
        // them would only create a second source of truth.
        authorizationUrl: preset ? null : (dto.authorizationUrl ?? null),
        tokenUrl: preset ? null : (dto.tokenUrl ?? null),
        userinfoUrl: preset ? null : (dto.userinfoUrl ?? null),
        issuer: dto.issuer ?? null,
        claimSub: dto.claimSub ?? 'sub',
        claimEmail: dto.claimEmail ?? 'email',
        claimUsername: dto.claimUsername ?? 'preferred_username',
        claimAvatar: dto.claimAvatar ?? 'picture',
      },
      select: providerSelect,
    });

    return withProviderExtras(
      provider,
      this.applications.callbackUrl(provider.id),
    );
  }

  async getProvider(providerId: string) {
    const provider = await this.prisma.applicationProvider.findUnique({
      where: { id: providerId },
      select: providerSelect,
    });

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    return withProviderExtras(
      provider,
      this.applications.callbackUrl(provider.id),
    );
  }

  async updateProvider(providerId: string, dto: UpdateProviderDto) {
    const current = await this.prisma.applicationProvider.findUnique({
      where: { id: providerId },
      select: { id: true, kind: true },
    });

    if (!current) {
      throw new NotFoundException('Provider not found');
    }

    const isPreset = findPreset(current.kind) !== null;

    const provider = await this.prisma.applicationProvider.update({
      where: { id: providerId },
      data: {
        displayName: dto.displayName,
        iconName: dto.iconName,
        sortOrder: dto.sortOrder,
        isEnabled: dto.isEnabled,
        clientId: dto.clientId,
        scopes: dto.scopes,
        usePkce: dto.usePkce,
        issuer: dto.issuer,
        claimSub: dto.claimSub,
        claimEmail: dto.claimEmail,
        claimUsername: dto.claimUsername,
        claimAvatar: dto.claimAvatar,
        ...(isPreset
          ? {}
          : {
              authorizationUrl: dto.authorizationUrl,
              tokenUrl: dto.tokenUrl,
              userinfoUrl: dto.userinfoUrl,
            }),
      },
      select: providerSelect,
    });

    return withProviderExtras(
      provider,
      this.applications.callbackUrl(provider.id),
    );
  }

  async rotateProviderSecret(providerId: string, clientSecret: string) {
    const provider = await this.prisma.applicationProvider.update({
      where: { id: providerId },
      data: {
        clientSecretEnc: this.crypto.seal(clientSecret),
        clientSecretLast4: SecretCryptoService.last4(clientSecret),
        clientSecretUpdatedAt: new Date(),
      },
      select: providerSelect,
    });

    return withProviderExtras(
      provider,
      this.applications.callbackUrl(provider.id),
    );
  }

  async removeProvider(providerId: string): Promise<void> {
    await this.prisma.applicationProvider.delete({ where: { id: providerId } });
  }

  async listUsers(applicationId: string, query: ListQueryDto) {
    await this.ensureExists(applicationId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where = {
      applicationId,
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q, mode: 'insensitive' as const } },
              { username: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async setUserBlocked(userId: string, isBlocked: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isBlocked },
      select: userSelect,
    });
  }

  /** Catalog backing the provider form in the admin UI. */
  listProviderKinds() {
    return Object.values(ProviderKind).map((kind) => {
      const preset = findPreset(kind);

      return {
        kind,
        displayName: preset?.displayName ?? kind,
        iconName: preset?.iconName ?? 'key',
        defaultScopes: preset?.defaultScopes ?? [],
        usePkce: preset?.usePkce ?? true,
        requiresEndpoints: preset === null,
      };
    });
  }

  private async ensureExists(id: string) {
    const application = await this.prisma.application.findUnique({
      where: { id },
      select: { id: true, tokenTtlSeconds: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return application;
  }

  private publicBase(): string {
    return this.applications.publicBaseUrl();
  }
}
