import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * RFC 6238 time-based one-time passwords, written by hand for the same reason
 * the OAuth client is: the alternatives (`otplib`, `speakeasy`) either pull an
 * ESM-only dependency tree into a CommonJS build or bundle a base32 codec and a
 * QR renderer that this service does not use. The whole algorithm is an HMAC
 * and a truncation, and the test vectors in the RFC pin it exactly.
 */

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

/**
 * Google Authenticator ignores the algorithm, digits and period parameters of
 * an enrolment URI and always assumes these values. Anything else produces an
 * app that shows codes the server rejects, so they are defaults rather than
 * options.
 */
export const TOTP_DEFAULTS = {
  algorithm: 'SHA1' as TotpAlgorithm,
  digits: 6,
  period: 30,
};

/**
 * How many steps either side of the current one are accepted. One step is the
 * usual compromise: it forgives a phone clock up to 30 seconds out and a user
 * who types slowly, without widening the guessing surface much.
 */
export const TOTP_WINDOW = 1;

export interface TotpParameters {
  algorithm: TotpAlgorithm;
  digits: number;
  period: number;
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Unpadded base32 (RFC 4648) — the encoding every authenticator app expects. */
export function base32Encode(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(input: string): Buffer {
  // Padding and casing vary between the apps that let you type a secret by
  // hand; the alphabet does not.
  const normalized = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) {
      throw new Error(`"${character}" is not a base32 character`);
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * A fresh shared secret. Twenty bytes is the RFC 4226 recommendation and the
 * size every authenticator app is known to accept.
 */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/** The counter a timestamp falls into, for a given step length. */
export function timeStep(period: number, at: Date = new Date()): number {
  return Math.floor(at.getTime() / 1000 / period);
}

/** RFC 4226 HOTP: HMAC, dynamic truncation, then the low `digits` decimals. */
export function hotp(
  secret: Buffer,
  counter: number,
  parameters: Pick<TotpParameters, 'algorithm' | 'digits'>,
): string {
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac(parameters.algorithm.toLowerCase(), secret)
    .update(counterBytes)
    .digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const truncated =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];

  return (truncated % 10 ** parameters.digits)
    .toString()
    .padStart(parameters.digits, '0');
}

/** The code an app would be showing for a secret at a given instant. */
export function totp(
  secret: string,
  parameters: TotpParameters = TOTP_DEFAULTS,
  at: Date = new Date(),
): string {
  return hotp(
    base32Decode(secret),
    timeStep(parameters.period, at),
    parameters,
  );
}

/** Digits only: users paste codes with spaces in them, and apps show them that way. */
export function normalizeTotpCode(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

function equals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Checks a code against the steps around now.
 *
 * Returns the step it matched rather than a boolean: the caller records it, so
 * that a code seen over someone's shoulder cannot be used again inside the
 * window it is still valid for.
 */
export function verifyTotp(params: {
  secret: string;
  code: string;
  parameters?: TotpParameters;
  window?: number;
  at?: Date;
}): number | null {
  const parameters = params.parameters ?? TOTP_DEFAULTS;
  const window = params.window ?? TOTP_WINDOW;
  const code = normalizeTotpCode(params.code);

  if (!new RegExp(`^\\d{${parameters.digits}}$`).test(code)) {
    return null;
  }

  const secret = base32Decode(params.secret);
  const current = timeStep(parameters.period, params.at ?? new Date());

  let matched: number | null = null;

  // Every candidate is evaluated even after a match, so the time taken does not
  // reveal how far off the submitted code was.
  for (let offset = -window; offset <= window; offset += 1) {
    const step = current + offset;
    if (step < 0) {
      continue;
    }

    if (equals(hotp(secret, step, parameters), code) && matched === null) {
      matched = step;
    }
  }

  return matched;
}

/**
 * The `otpauth://` URI an authenticator app reads from a QR code.
 *
 * The issuer appears twice on purpose: as a label prefix for apps that only
 * parse the label, and as a parameter for those that follow the current
 * Key URI Format.
 */
export function buildOtpAuthUri(params: {
  issuer: string;
  accountName: string;
  secret: string;
  parameters?: TotpParameters;
}): string {
  const parameters = params.parameters ?? TOTP_DEFAULTS;
  const label = `${encodeURIComponent(params.issuer)}:${encodeURIComponent(
    params.accountName,
  )}`;

  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: parameters.algorithm,
    digits: String(parameters.digits),
    period: String(parameters.period),
  });

  return `otpauth://totp/${label}?${query.toString()}`;
}
