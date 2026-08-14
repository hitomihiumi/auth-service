import { ProviderKind } from '@prisma/client';
import { discordPreset } from './discord.preset';
import { githubPreset } from './github.preset';
import { googlePreset } from './google.preset';
import { ProviderPreset } from './preset.types';

/**
 * Presets exist so an admin only has to paste a client id and secret for the
 * common providers. Generic kinds have no entry here — their endpoints and
 * claim paths come from the database row.
 */
const PRESETS: Partial<Record<ProviderKind, ProviderPreset>> = {
  [ProviderKind.GOOGLE]: googlePreset,
  [ProviderKind.DISCORD]: discordPreset,
  [ProviderKind.GITHUB]: githubPreset,
};

export function findPreset(kind: ProviderKind): ProviderPreset | null {
  return PRESETS[kind] ?? null;
}

/** Catalog served to the admin UI so its provider form can be data-driven. */
export function listPresets(): Array<{
  kind: ProviderKind;
  displayName: string;
  iconName: string;
  defaultScopes: string[];
  usePkce: boolean;
  requiresEndpoints: boolean;
}> {
  const presets = Object.values(PRESETS).map((preset) => ({
    kind: preset.kind,
    displayName: preset.displayName,
    iconName: preset.iconName,
    defaultScopes: preset.defaultScopes,
    usePkce: preset.usePkce,
    requiresEndpoints: false,
  }));

  return [
    ...presets,
    {
      kind: ProviderKind.OIDC,
      displayName: 'OpenID Connect',
      iconName: 'key',
      defaultScopes: ['openid', 'profile', 'email'],
      usePkce: true,
      requiresEndpoints: true,
    },
    {
      kind: ProviderKind.OAUTH2,
      displayName: 'OAuth 2.0',
      iconName: 'key',
      defaultScopes: [],
      usePkce: true,
      requiresEndpoints: true,
    },
  ];
}

export * from './preset.types';
