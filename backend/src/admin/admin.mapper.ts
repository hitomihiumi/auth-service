import { Prisma } from '@prisma/client';

/**
 * Explicit selects are the primary guarantee that an encrypted secret never
 * reaches a response — filtering after the fact is one forgotten spread away
 * from leaking. `clientSecretEnc` and `privateKeyEnc` appear in no select here.
 */
export const providerSelect = {
  id: true,
  applicationId: true,
  kind: true,
  slug: true,
  displayName: true,
  iconName: true,
  sortOrder: true,
  isEnabled: true,
  clientId: true,
  clientSecretLast4: true,
  clientSecretUpdatedAt: true,
  scopes: true,
  authorizationUrl: true,
  tokenUrl: true,
  userinfoUrl: true,
  issuer: true,
  usePkce: true,
  claimSub: true,
  claimEmail: true,
  claimUsername: true,
  claimAvatar: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ApplicationProviderSelect;

export const applicationSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  clientId: true,
  tokenTtlSeconds: true,
  allowEmailLinking: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ApplicationSelect;

export const userSelect = {
  id: true,
  email: true,
  emailVerified: true,
  username: true,
  avatarUrl: true,
  isBlocked: true,
  lastLoginAt: true,
  createdAt: true,
  identities: {
    select: {
      id: true,
      providerAccountId: true,
      createdAt: true,
      applicationProvider: { select: { slug: true, displayName: true } },
    },
  },
} satisfies Prisma.UserSelect;

export type ProviderView = Prisma.ApplicationProviderGetPayload<{
  select: typeof providerSelect;
}>;

/** Adds the fields the admin UI needs but the table does not store. */
export function withProviderExtras(
  provider: ProviderView,
  callbackUrl: string,
): ProviderView & { callbackUrl: string; hasClientSecret: boolean } {
  return {
    ...provider,
    callbackUrl,
    hasClientSecret: provider.clientSecretLast4.length > 0,
  };
}
