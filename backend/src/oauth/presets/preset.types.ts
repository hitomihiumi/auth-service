import { ProviderKind } from '@prisma/client';
import { NormalizedProfile } from '../profile';

/** Helpers a preset may use while mapping, e.g. for a follow-up API call. */
export interface PresetContext {
  accessToken: string;
  fetchJson(url: string, init?: RequestInit): Promise<unknown>;
}

export interface ProviderPreset {
  kind: ProviderKind;
  /** Suggested values for the admin form; all remain editable. */
  displayName: string;
  iconName: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  defaultScopes: string[];
  /** GitHub OAuth Apps do not implement PKCE, so this varies by provider. */
  usePkce: boolean;
  /** Extra query parameters on the authorize URL. */
  authorizationParams?: Record<string, string>;
  /** Extra headers on the userinfo request. */
  userinfoHeaders?: Record<string, string>;
  mapProfile(
    raw: unknown,
    ctx: PresetContext,
  ): NormalizedProfile | Promise<NormalizedProfile>;
}

/** True for the kinds whose endpoints an admin must supply by hand. */
export function isGenericKind(kind: ProviderKind): boolean {
  return kind === ProviderKind.OIDC || kind === ProviderKind.OAUTH2;
}
