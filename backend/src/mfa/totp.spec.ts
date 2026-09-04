import {
  base32Decode,
  base32Encode,
  buildOtpAuthUri,
  generateTotpSecret,
  totp,
  TOTP_DEFAULTS,
  TotpAlgorithm,
  verifyTotp,
} from './totp';

/** The RFC 6238 appendix B seeds, as the base32 an authenticator app is given. */
const SEEDS: Record<TotpAlgorithm, string> = {
  SHA1: base32Encode(Buffer.from('12345678901234567890', 'ascii')),
  SHA256: base32Encode(
    Buffer.from('12345678901234567890123456789012', 'ascii'),
  ),
  SHA512: base32Encode(
    Buffer.from(
      '1234567890123456789012345678901234567890123456789012345678901234',
      'ascii',
    ),
  ),
};

const at = (unixSeconds: number): Date => new Date(unixSeconds * 1000);

describe('base32', () => {
  it.each([
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ])('encodes %p as %p (RFC 4648)', (input, expected) => {
    expect(base32Encode(Buffer.from(input, 'ascii'))).toBe(expected);
  });

  it('round-trips arbitrary bytes', () => {
    const bytes = Buffer.from([0x00, 0xff, 0x10, 0x7f, 0x80, 0x01, 0x2c]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it('accepts the padding and lowercase a user might type back in', () => {
    expect(base32Decode('mzxw6ytboi===')).toEqual(
      Buffer.from('foobar', 'ascii'),
    );
  });

  it('rejects characters outside the alphabet', () => {
    // "1", "8", "0" and "9" are excluded precisely because they are misread.
    expect(() => base32Decode('MZXW6YTB01')).toThrow(/not a base32 character/);
  });
});

describe('totp', () => {
  // RFC 6238, appendix B. Eight digits, because that is what the table lists.
  const parameters = { ...TOTP_DEFAULTS, digits: 8 };

  it.each([
    [59, 'SHA1', '94287082'],
    [1111111109, 'SHA1', '07081804'],
    [1111111111, 'SHA1', '14050471'],
    [1234567890, 'SHA1', '89005924'],
    [2000000000, 'SHA1', '69279037'],
    [20000000000, 'SHA1', '65353130'],
    [59, 'SHA256', '46119246'],
    [1111111109, 'SHA256', '68084774'],
    [20000000000, 'SHA256', '77737706'],
    [59, 'SHA512', '90693936'],
    [1111111109, 'SHA512', '25091201'],
    [20000000000, 'SHA512', '47863826'],
  ] as Array<[number, TotpAlgorithm, string]>)(
    'matches the RFC vector at t=%p with %s',
    (seconds, algorithm, expected) => {
      expect(
        totp(SEEDS[algorithm], { ...parameters, algorithm }, at(seconds)),
      ).toBe(expected);
    },
  );

  it('produces the six digits an authenticator app shows by default', () => {
    expect(totp(SEEDS.SHA1, TOTP_DEFAULTS, at(59))).toBe('287082');
  });
});

describe('verifyTotp', () => {
  const secret = generateTotpSecret();
  const now = at(1_700_000_000);

  it('accepts the current code and reports its step', () => {
    const step = verifyTotp({
      secret,
      code: totp(secret, TOTP_DEFAULTS, now),
      at: now,
    });

    expect(step).toBe(Math.floor(1_700_000_000 / 30));
  });

  it('forgives a clock one step out in either direction', () => {
    const previous = totp(secret, TOTP_DEFAULTS, at(1_700_000_000 - 30));
    const next = totp(secret, TOTP_DEFAULTS, at(1_700_000_000 + 30));

    expect(verifyTotp({ secret, code: previous, at: now })).not.toBeNull();
    expect(verifyTotp({ secret, code: next, at: now })).not.toBeNull();
  });

  it('refuses a code from outside the window', () => {
    const stale = totp(secret, TOTP_DEFAULTS, at(1_700_000_000 - 120));

    expect(verifyTotp({ secret, code: stale, at: now })).toBeNull();
  });

  it('refuses another secret’s code', () => {
    const other = totp(generateTotpSecret(), TOTP_DEFAULTS, now);

    expect(verifyTotp({ secret, code: other, at: now })).toBeNull();
  });

  it('ignores the spacing apps display codes with', () => {
    const code = totp(secret, TOTP_DEFAULTS, now);
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;

    expect(verifyTotp({ secret, code: spaced, at: now })).not.toBeNull();
  });

  it.each(['', '12345', '1234567', 'abcdef', '12345a'])(
    'refuses %p without reaching the HMAC',
    (code) => {
      expect(verifyTotp({ secret, code, at: now })).toBeNull();
    },
  );
});

describe('buildOtpAuthUri', () => {
  it('carries the parameters an app needs to reproduce the codes', () => {
    const uri = new URL(
      buildOtpAuthUri({
        issuer: 'Example App',
        accountName: 'ada@example.com',
        secret: 'JBSWY3DPEHPK3PXP',
      }),
    );

    expect(uri.protocol).toBe('otpauth:');
    expect(uri.host).toBe('totp');
    expect(decodeURIComponent(uri.pathname)).toBe(
      '/Example App:ada@example.com',
    );
    expect(uri.searchParams.get('secret')).toBe('JBSWY3DPEHPK3PXP');
    expect(uri.searchParams.get('issuer')).toBe('Example App');
    expect(uri.searchParams.get('algorithm')).toBe('SHA1');
    expect(uri.searchParams.get('digits')).toBe('6');
    expect(uri.searchParams.get('period')).toBe('30');
  });

  it('escapes a label that would otherwise break the URI', () => {
    const uri = buildOtpAuthUri({
      issuer: 'A/B:Co',
      accountName: 'user name@example.com',
      secret: 'JBSWY3DPEHPK3PXP',
    });

    expect(uri).toContain(
      'otpauth://totp/A%2FB%3ACo:user%20name%40example.com',
    );
  });
});
