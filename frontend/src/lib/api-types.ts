export type ProviderKind = "GOOGLE" | "DISCORD" | "GITHUB" | "OIDC" | "OAUTH2";

export interface ProviderKindInfo {
  kind: ProviderKind;
  displayName: string;
  iconName: string;
  defaultScopes: string[];
  usePkce: boolean;
  /** Generic kinds need authorization/token/userinfo URLs typed in by hand. */
  requiresEndpoints: boolean;
}

/**
 * A configured login provider. The client secret is deliberately absent — the
 * API only ever reports its last four characters.
 */
export interface Provider {
  id: string;
  applicationId: string;
  kind: ProviderKind;
  slug: string;
  displayName: string;
  iconName: string | null;
  sortOrder: number;
  isEnabled: boolean;
  clientId: string;
  clientSecretLast4: string;
  clientSecretUpdatedAt: string;
  scopes: string[];
  authorizationUrl: string | null;
  tokenUrl: string | null;
  userinfoUrl: string | null;
  issuer: string | null;
  usePkce: boolean;
  claimSub: string | null;
  claimEmail: string | null;
  claimUsername: string | null;
  claimAvatar: string | null;
  /** Register this with the upstream provider. */
  callbackUrl: string;
  hasClientSecret: boolean;
}

export interface RedirectUri {
  id: string;
  uri: string;
  createdAt: string;
}

export interface SigningKey {
  id: string;
  kid: string;
  algorithm: string;
  isActive: boolean;
  createdAt: string;
  expiresAt: string | null;
}

export interface ApplicationSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  clientId: string;
  tokenTtlSeconds: number;
  allowEmailLinking: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Present on the list endpoint; the detail endpoint counts users only. */
  _count?: { users: number; providers?: number };
}

export interface ApplicationDetail extends ApplicationSummary {
  redirectUris: RedirectUri[];
  providers: Provider[];
  signingKeys: SigningKey[];
  jwksUrl: string;
  loginUrlTemplate: string;
  _count: { users: number };
}

export interface AppUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  username: string | null;
  avatarUrl: string | null;
  isBlocked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  identities: Array<{
    id: string;
    providerAccountId: string;
    createdAt: string;
    applicationProvider: { slug: string; displayName: string };
  }>;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminIdentity {
  id: string;
  email: string;
  role: "OWNER" | "ADMIN";
}

/** Public login-page payload; no authentication required. */
export interface PublicProviders {
  application: { slug: string; name: string };
  providers: Array<{
    slug: string;
    displayName: string;
    iconName: string | null;
  }>;
}
