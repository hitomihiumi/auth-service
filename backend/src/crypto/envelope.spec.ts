import { randomBytes } from 'node:crypto';
import {
  buildKeyring,
  isSealed,
  Keyring,
  MalformedSecretError,
  openSecret,
  sealSecret,
  sealedKeyId,
  UnknownEncryptionKeyError,
} from './envelope';

const keyOf = (seed: string): string =>
  Buffer.alloc(32, seed).toString('base64');

describe('envelope', () => {
  const keyring: Keyring = {
    activeKeyId: '1',
    keys: { '1': Buffer.alloc(32, 'a') },
  };

  it('round-trips a secret', () => {
    const plaintext = 'GOCSPX-super-secret-value';
    expect(openSecret(sealSecret(plaintext, keyring), keyring)).toBe(plaintext);
  });

  it('round-trips unicode and empty values', () => {
    for (const value of ['', 'пароль-の-🔐', 'a'.repeat(4096)]) {
      expect(openSecret(sealSecret(value, keyring), keyring)).toBe(value);
    }
  });

  it('produces a different blob every time for the same plaintext', () => {
    const a = sealSecret('same', keyring);
    const b = sealSecret('same', keyring);
    expect(a).not.toBe(b);
    expect(openSecret(a, keyring)).toBe(openSecret(b, keyring));
  });

  it('is recognised by isSealed and reports its key id', () => {
    const blob = sealSecret('x', keyring);
    expect(isSealed(blob)).toBe(true);
    expect(sealedKeyId(blob)).toBe('1');
    expect(isSealed('plaintext')).toBe(false);
  });

  it.each([2, 3, 4, 5, 6, 7])(
    'rejects a blob whose segment %i has been tampered with',
    (index) => {
      const segments = sealSecret('secret', keyring).split('.');
      // Flip the segment to a different value of the same length.
      const original = Buffer.from(segments[index], 'base64url');
      let replacement = randomBytes(original.length);
      while (replacement.equals(original)) {
        replacement = randomBytes(original.length);
      }
      segments[index] = replacement.toString('base64url');

      expect(() => openSecret(segments.join('.'), keyring)).toThrow(
        MalformedSecretError,
      );
    },
  );

  it('rejects a blob sealed under a key that is no longer in the ring', () => {
    const blob = sealSecret('secret', keyring);
    const otherRing: Keyring = {
      activeKeyId: '2',
      keys: { '2': Buffer.alloc(32, 'b') },
    };

    expect(() => openSecret(blob, otherRing)).toThrow(
      UnknownEncryptionKeyError,
    );
  });

  it('rejects a blob whose key id was swapped to another live key', () => {
    const twoKeys: Keyring = {
      activeKeyId: '1',
      keys: { '1': Buffer.alloc(32, 'a'), '2': Buffer.alloc(32, 'b') },
    };
    const segments = sealSecret('secret', twoKeys).split('.');
    segments[1] = '2';

    // The key id is authenticated as AAD, so this fails rather than silently
    // decrypting under the wrong key.
    expect(() => openSecret(segments.join('.'), twoKeys)).toThrow(
      MalformedSecretError,
    );
  });

  it.each([
    ['v1.1.aa.bb', 'too few segments'],
    ['v2.1.aa.bb.cc.dd.ee.ff', 'unsupported version'],
  ])('rejects %s', (blob) => {
    expect(() => openSecret(blob, keyring)).toThrow(MalformedSecretError);
  });

  it('decrypts blobs sealed under a retired key while writing with the active one', () => {
    const oldRing: Keyring = {
      activeKeyId: '1',
      keys: { '1': Buffer.alloc(32, 'a') },
    };
    const rotated: Keyring = {
      activeKeyId: '2',
      keys: { '1': Buffer.alloc(32, 'a'), '2': Buffer.alloc(32, 'b') },
    };

    const legacy = sealSecret('legacy-secret', oldRing);
    expect(openSecret(legacy, rotated)).toBe('legacy-secret');

    const fresh = sealSecret('fresh-secret', rotated);
    expect(sealedKeyId(fresh)).toBe('2');
  });
});

describe('buildKeyring', () => {
  it('normalises a single key into a ring with id "1"', () => {
    const ring = buildKeyring({ encryptionKey: keyOf('a') });
    expect(ring.activeKeyId).toBe('1');
    expect(ring.keys['1']).toHaveLength(32);
  });

  it('parses the keyring form', () => {
    const ring = buildKeyring({
      encryptionKeys: JSON.stringify({ '1': keyOf('a'), '2': keyOf('b') }),
      activeKeyId: '2',
    });
    expect(Object.keys(ring.keys).sort()).toEqual(['1', '2']);
    expect(ring.activeKeyId).toBe('2');
  });

  const invalidSources: Array<[string, Parameters<typeof buildKeyring>[0]]> = [
    ['short key', { encryptionKey: Buffer.alloc(16, 'a').toString('base64') }],
    ['invalid json', { encryptionKeys: 'not json', activeKeyId: '1' }],
    [
      'active key missing from ring',
      { encryptionKeys: JSON.stringify({ '1': keyOf('a') }), activeKeyId: '9' },
    ],
    ['no key at all', {}],
  ];

  it.each(invalidSources)('rejects %s', (_label, source) => {
    expect(() => buildKeyring(source)).toThrow();
  });
});
