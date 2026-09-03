import { randomBytes } from 'node:crypto';

/**
 * Single-use codes for the user whose phone is lost, wiped or simply elsewhere.
 * Without them a second factor is a way to lock people out of their own
 * account, and the only remedy left is an admin reset.
 */

/**
 * Deliberately missing i, l, o, 0 and 1: these are read off a printout or a
 * screenshot and typed back in, sometimes months later.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

const GROUPS = 2;
const GROUP_LENGTH = 5;

export const RECOVERY_CODE_COUNT = 10;

/** Ten characters of this alphabet is a little under fifty bits. */
export function generateRecoveryCode(): string {
  const length = GROUPS * GROUP_LENGTH;
  const characters: string[] = [];

  // Rejection sampling rather than a modulo: 256 is not a multiple of 31, so
  // folding a byte would quietly make the first eight letters likelier.
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

  while (characters.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte < limit) {
        characters.push(ALPHABET[byte % ALPHABET.length]);
        if (characters.length === length) {
          break;
        }
      }
    }
  }

  return Array.from({ length: GROUPS }, (_, group) =>
    characters.slice(group * GROUP_LENGTH, (group + 1) * GROUP_LENGTH).join(''),
  ).join('-');
}

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => generateRecoveryCode());
}

/**
 * Reduces a typed code to what is compared. The grouping hyphen, stray spaces
 * and capitals are presentation, so none of them may decide a match.
 */
export function normalizeRecoveryCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}
