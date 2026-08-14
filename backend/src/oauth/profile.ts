/**
 * The shape every provider is normalised into before it reaches the domain.
 * Keeping provider quirks behind this boundary is what lets a new provider be
 * added as configuration rather than as a new Passport strategy.
 */
export interface NormalizedProfile {
  /** The provider's own account identifier. Half of an Identity's natural key. */
  providerAccountId: string;
  email: string | null;
  /** Only a verified address may be used to link to an existing account. */
  emailVerified: boolean;
  username: string | null;
  avatarUrl: string | null;
  /** Raw payload, stored for debugging provider-specific surprises. */
  raw: unknown;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Coerces a claim to a non-empty string. Numeric identifiers are common —
 * GitHub's `id` and many OIDC `sub` claims are numbers.
 */
export function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value.length > 0 ? value : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return null;
}

export function asBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}
