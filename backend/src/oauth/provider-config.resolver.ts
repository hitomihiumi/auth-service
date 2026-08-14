import { Injectable } from '@nestjs/common';
import { ApplicationProvider, ProviderKind } from '@prisma/client';
import { UnknownProviderError } from '../common/errors';
import { getStringClaim } from './claim-mapper';
import { findPreset, isGenericKind, PresetContext } from './presets';
import { asBoolean, asRecord, NormalizedProfile } from './profile';

/** A provider row merged with its preset into everything the flow needs. */
export interface ResolvedProviderConfig {
  id: string;
  applicationId: string;
  kind: ProviderKind;
  slug: string;
  displayName: string;
  iconName: string | null;
  clientId: string;
  clientSecretEnc: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scopes: string[];
  usePkce: boolean;
  authorizationParams: Record<string, string>;
  userinfoHeaders: Record<string, string>;
  mapProfile(
    raw: unknown,
    ctx: PresetContext,
  ): NormalizedProfile | Promise<NormalizedProfile>;
}

@Injectable()
export class ProviderConfigResolver {
  /**
   * Preset kinds take their endpoints from the catalog and ignore any URL
   * columns, so a preset cannot be re-pointed at an attacker's token endpoint
   * by editing the row. Generic kinds require the columns to be populated,
   * which the admin DTO enforces at write time.
   */
  resolve(provider: ApplicationProvider): ResolvedProviderConfig {
    const preset = findPreset(provider.kind);

    if (preset) {
      return {
        ...this.commonFields(provider),
        authorizationUrl: preset.authorizationUrl,
        tokenUrl: preset.tokenUrl,
        userinfoUrl: preset.userinfoUrl,
        scopes:
          provider.scopes.length > 0 ? provider.scopes : preset.defaultScopes,
        usePkce: provider.usePkce && preset.usePkce,
        authorizationParams: preset.authorizationParams ?? {},
        userinfoHeaders: preset.userinfoHeaders ?? {},
        iconName: provider.iconName ?? preset.iconName,
        mapProfile: (raw, ctx) => preset.mapProfile(raw, ctx),
      };
    }

    if (!isGenericKind(provider.kind)) {
      throw new UnknownProviderError(
        `Provider kind ${provider.kind} has no preset and is not generic`,
      );
    }

    if (
      !provider.authorizationUrl ||
      !provider.tokenUrl ||
      !provider.userinfoUrl
    ) {
      throw new UnknownProviderError(
        `Provider "${provider.slug}" is generic but is missing endpoint configuration`,
      );
    }

    return {
      ...this.commonFields(provider),
      authorizationUrl: provider.authorizationUrl,
      tokenUrl: provider.tokenUrl,
      userinfoUrl: provider.userinfoUrl,
      scopes: provider.scopes,
      usePkce: provider.usePkce,
      authorizationParams: {},
      userinfoHeaders: {},
      mapProfile: (raw) => this.mapByClaims(provider, raw),
    };
  }

  private commonFields(
    provider: ApplicationProvider,
  ): Omit<
    ResolvedProviderConfig,
    | 'authorizationUrl'
    | 'tokenUrl'
    | 'userinfoUrl'
    | 'scopes'
    | 'usePkce'
    | 'authorizationParams'
    | 'userinfoHeaders'
    | 'mapProfile'
  > {
    return {
      id: provider.id,
      applicationId: provider.applicationId,
      kind: provider.kind,
      slug: provider.slug,
      displayName: provider.displayName,
      iconName: provider.iconName,
      clientId: provider.clientId,
      clientSecretEnc: provider.clientSecretEnc,
    };
  }

  /** Claim-path mapping for providers configured entirely through the admin UI. */
  private mapByClaims(
    provider: ApplicationProvider,
    raw: unknown,
  ): NormalizedProfile {
    const payload = asRecord(raw) ?? {};

    return {
      providerAccountId: getStringClaim(raw, provider.claimSub) ?? '',
      email: getStringClaim(raw, provider.claimEmail),
      // Absent `email_verified` means unverified, which blocks account linking.
      emailVerified: asBoolean(payload.email_verified),
      username: getStringClaim(raw, provider.claimUsername),
      avatarUrl: getStringClaim(raw, provider.claimAvatar),
      raw,
    };
  }
}
