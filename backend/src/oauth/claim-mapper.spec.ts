import { getClaim, getStringClaim } from './claim-mapper';

describe('getClaim', () => {
  const payload = {
    sub: 'abc',
    id: 12345,
    profile: { name: 'Ada', avatar: { url: 'https://example.com/a.png' } },
    empty: '',
    nested: { deep: { value: true } },
  };

  it.each([
    ['sub', 'abc'],
    ['profile.name', 'Ada'],
    ['profile.avatar.url', 'https://example.com/a.png'],
  ])('resolves %s', (path, expected) => {
    expect(getClaim(payload, path)).toBe(expected);
  });

  it('coerces numeric identifiers, which GitHub and some OIDC issuers return', () => {
    expect(getStringClaim(payload, 'id')).toBe('12345');
  });

  it.each([
    ['missing', 'unknown key'],
    ['profile.missing', 'unknown nested key'],
    ['sub.deeper', 'walking into a string'],
    ['', 'empty path'],
    ['profile..name', 'empty segment'],
  ])('returns undefined for %s (%s)', (path) => {
    expect(getClaim(payload, path)).toBeUndefined();
  });

  it('returns null for a null path', () => {
    expect(getStringClaim(payload, null)).toBeNull();
  });

  it('treats an empty string claim as absent', () => {
    expect(getStringClaim(payload, 'empty')).toBeNull();
  });

  // Claim paths are typed in by an admin, so prototype traversal is refused
  // rather than merely returning undefined by accident.
  it.each(['__proto__', 'constructor', 'prototype', 'constructor.name'])(
    'refuses to walk %s',
    (path) => {
      expect(getClaim(payload, path)).toBeUndefined();
    },
  );

  it('does not resolve inherited properties', () => {
    expect(getClaim(payload, 'toString')).toBeUndefined();
    expect(getClaim(payload, 'hasOwnProperty')).toBeUndefined();
  });

  it.each([null, undefined, 'a string', 42, ['an', 'array']])(
    'returns undefined when the payload is %p',
    (value) => {
      expect(getClaim(value, 'sub')).toBeUndefined();
    },
  );
});
