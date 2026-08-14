import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const SEGMENT_COUNT = 8;

/**
 * Root keys, by id. Blobs record the id of the key that wrapped them, so keys
 * can be rotated without a flag day: both old and new stay in the ring until
 * `rewrap-secrets` has migrated every row.
 */
export interface Keyring {
  activeKeyId: string;
  keys: Record<string, Buffer>;
}

export class UnknownEncryptionKeyError extends Error {
  constructor(readonly keyId: string) {
    super(
      `Encryption key "${keyId}" is not present in the keyring; the blob cannot be decrypted`,
    );
    this.name = 'UnknownEncryptionKeyError';
  }
}

export class MalformedSecretError extends Error {
  constructor(reason: string) {
    super(`Stored secret is malformed: ${reason}`);
    this.name = 'MalformedSecretError';
  }
}

const encode = (buffer: Buffer): string => buffer.toString('base64url');

/**
 * Decodes a segment, checking its exact length where the format fixes one. The
 * ciphertext has no expected length — an empty secret is legitimately empty.
 */
function decode(value: string, label: string, expectedBytes?: number): Buffer {
  const buffer = Buffer.from(value, 'base64url');

  if (expectedBytes !== undefined && buffer.length !== expectedBytes) {
    throw new MalformedSecretError(
      `${label} segment must be ${expectedBytes} bytes, got ${buffer.length}`,
    );
  }

  return buffer;
}

function resolveKey(keyring: Keyring, keyId: string): Buffer {
  const key = keyring.keys[keyId];
  if (!key) {
    throw new UnknownEncryptionKeyError(keyId);
  }
  return key;
}

/**
 * Envelope-encrypts a secret.
 *
 * A fresh data key is generated per secret and encrypted under the active root
 * key. Rotating the root key therefore only re-wraps data keys, instead of
 * requiring every plaintext secret to be held in memory at once.
 *
 * Output format (all segments base64url):
 *   v1.<kekId>.<dekIv>.<dekTag>.<wrappedDek>.<iv>.<tag>.<ciphertext>
 */
export function sealSecret(plaintext: string, keyring: Keyring): string {
  const kekId = keyring.activeKeyId;
  const kek = resolveKey(keyring, kekId);

  if (kekId.includes('.')) {
    throw new MalformedSecretError('key ids must not contain "."');
  }

  const dek = randomBytes(KEY_BYTES);

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, dek, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // The key id is authenticated so a blob cannot be replayed under a different
  // root key by editing its prefix.
  const dekIv = randomBytes(IV_BYTES);
  const dekCipher = createCipheriv(ALGORITHM, kek, dekIv);
  dekCipher.setAAD(Buffer.from(kekId, 'utf8'));
  const wrappedDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekTag = dekCipher.getAuthTag();

  return [
    VERSION,
    kekId,
    encode(dekIv),
    encode(dekTag),
    encode(wrappedDek),
    encode(iv),
    encode(tag),
    encode(ciphertext),
  ].join('.');
}

/**
 * Reverses {@link sealSecret}. Throws rather than returning a partial result if
 * any segment has been tampered with — GCM authentication covers both layers.
 */
export function openSecret(blob: string, keyring: Keyring): string {
  const segments = blob.split('.');
  if (segments.length !== SEGMENT_COUNT) {
    throw new MalformedSecretError(
      `expected ${SEGMENT_COUNT} segments, got ${segments.length}`,
    );
  }

  const [version, kekId, dekIv, dekTag, wrappedDek, iv, tag, ciphertext] =
    segments as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];

  if (version !== VERSION) {
    throw new MalformedSecretError(`unsupported version "${version}"`);
  }

  const kek = resolveKey(keyring, kekId);

  let dek: Buffer;
  try {
    const dekDecipher = createDecipheriv(
      ALGORITHM,
      kek,
      decode(dekIv, 'dekIv', IV_BYTES),
    );
    dekDecipher.setAAD(Buffer.from(kekId, 'utf8'));
    dekDecipher.setAuthTag(decode(dekTag, 'dekTag', TAG_BYTES));
    dek = Buffer.concat([
      dekDecipher.update(decode(wrappedDek, 'wrappedDek', KEY_BYTES)),
      dekDecipher.final(),
    ]);
  } catch (error) {
    if (error instanceof MalformedSecretError) {
      throw error;
    }
    throw new MalformedSecretError('data key authentication failed');
  }

  if (dek.length !== KEY_BYTES) {
    throw new MalformedSecretError('unwrapped data key has the wrong length');
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      dek,
      decode(iv, 'iv', IV_BYTES),
    );
    decipher.setAuthTag(decode(tag, 'tag', TAG_BYTES));
    return Buffer.concat([
      decipher.update(decode(ciphertext, 'ciphertext')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    if (error instanceof MalformedSecretError) {
      throw error;
    }
    throw new MalformedSecretError('payload authentication failed');
  }
}

/** True when the value looks like a blob this module produced. */
export function isSealed(value: string): boolean {
  return (
    value.startsWith(`${VERSION}.`) && value.split('.').length === SEGMENT_COUNT
  );
}

/** The root key id a blob was sealed under, for rotation reporting. */
export function sealedKeyId(blob: string): string {
  const segments = blob.split('.');
  if (segments.length !== SEGMENT_COUNT) {
    throw new MalformedSecretError('cannot read key id from a malformed blob');
  }
  return segments[1];
}

/**
 * Builds a keyring from the two supported environment shapes: a single
 * ENCRYPTION_KEY, or an ENCRYPTION_KEYS map plus ENCRYPTION_ACTIVE_KEY_ID.
 */
export function buildKeyring(source: {
  encryptionKey?: string;
  encryptionKeys?: string;
  activeKeyId?: string;
}): Keyring {
  if (source.encryptionKeys) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(source.encryptionKeys);
    } catch {
      throw new Error(
        'ENCRYPTION_KEYS must be a JSON object of id -> base64 key',
      );
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error(
        'ENCRYPTION_KEYS must be a JSON object of id -> base64 key',
      );
    }

    const keys: Record<string, Buffer> = {};
    for (const [id, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof value !== 'string') {
        throw new Error(`ENCRYPTION_KEYS["${id}"] must be a base64 string`);
      }
      const key = Buffer.from(value, 'base64');
      if (key.length !== KEY_BYTES) {
        throw new Error(
          `ENCRYPTION_KEYS["${id}"] must decode to ${KEY_BYTES} bytes`,
        );
      }
      keys[id] = key;
    }

    const activeKeyId = source.activeKeyId ?? '';
    if (!keys[activeKeyId]) {
      throw new Error(
        `ENCRYPTION_ACTIVE_KEY_ID "${activeKeyId}" is not present in ENCRYPTION_KEYS`,
      );
    }

    return { activeKeyId, keys };
  }

  if (!source.encryptionKey) {
    throw new Error('No encryption key configured');
  }

  const key = Buffer.from(source.encryptionKey, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes`);
  }

  return { activeKeyId: '1', keys: { '1': key } };
}

/** Constant-time comparison for session/token hashes. */
export function safeEquals(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
