import { asRecord, asString } from './profile';

/** Segments that would let a configured claim path walk into the prototype. */
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Resolves a dotted claim path against a userinfo payload.
 *
 * Used only by the generic OIDC/OAuth2 kinds, where an admin types the path in
 * — which is exactly why prototype-walking segments are rejected rather than
 * merely undefined.
 */
export function getClaim(payload: unknown, path: string | null): unknown {
  if (!path) {
    return undefined;
  }

  let current: unknown = payload;
  for (const segment of path.split('.')) {
    if (segment.length === 0 || FORBIDDEN_SEGMENTS.has(segment)) {
      return undefined;
    }

    const record = asRecord(current);
    if (!record || !Object.prototype.hasOwnProperty.call(record, segment)) {
      return undefined;
    }
    current = record[segment];
  }

  return current;
}

/** Convenience wrapper for the common "claim as a string" case. */
export function getStringClaim(
  payload: unknown,
  path: string | null,
): string | null {
  return asString(getClaim(payload, path));
}
