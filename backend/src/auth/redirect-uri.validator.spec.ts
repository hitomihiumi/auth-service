import { InvalidRedirectUriError } from '../common/errors';
import { RedirectUriValidator } from './redirect-uri.validator';

describe('RedirectUriValidator', () => {
  const validator = new RedirectUriValidator();

  describe('normalize', () => {
    it.each([
      ['http://localhost:5173/', 'http://localhost:5173'],
      ['http://localhost:5173', 'http://localhost:5173'],
      [
        'https://app.example.com/login/callback',
        'https://app.example.com/login/callback',
      ],
      [
        'https://app.example.com/login/callback/',
        'https://app.example.com/login/callback',
      ],
      ['https://app.example.com/cb?foo=1#frag', 'https://app.example.com/cb'],
      ['HTTPS://App.Example.COM/cb', 'https://app.example.com/cb'],
    ])('normalizes %s to %s', (input, expected) => {
      expect(validator.normalize(input)).toBe(expected);
    });

    // Each of these is a documented way of smuggling a foreign host past a
    // naive prefix or "starts with http" check.
    it.each([
      ['//evil.com', 'scheme-relative'],
      ['/\\evil.com', 'backslash'],
      ['/callback', 'path only'],
      ['evil.com', 'bare host'],
      ['javascript:alert(1)', 'javascript scheme'],
      ['data:text/html,<script>alert(1)</script>', 'data scheme'],
      ['file:///etc/passwd', 'file scheme'],
      ['https://user:pass@evil.com/cb', 'credentials'],
      ['https://localhost:5173@evil.com/cb', 'host confusion via credentials'],
      ['https://*.example.com/cb', 'wildcard'],
      ['', 'empty'],
      ['   ', 'whitespace'],
    ])('rejects %s (%s)', (input) => {
      expect(() => validator.normalize(input)).toThrow(InvalidRedirectUriError);
    });
  });

  describe('normalizeForRegistration', () => {
    it.each([
      'http://localhost:5173/',
      'http://127.0.0.1:3000/cb',
      'https://app.example.com/cb',
    ])('accepts %s', (input) => {
      expect(() => validator.normalizeForRegistration(input)).not.toThrow();
    });

    it('rejects plain http on a non-loopback host', () => {
      expect(() =>
        validator.normalizeForRegistration('http://app.example.com/cb'),
      ).toThrow(InvalidRedirectUriError);
    });
  });

  describe('resolve', () => {
    const allowlist = ['http://localhost:5173', 'https://app.example.com/cb'];

    it('falls back to the first registration when none is requested', () => {
      expect(validator.resolve(undefined, allowlist)).toBe(
        'http://localhost:5173',
      );
    });

    it('accepts a registered target regardless of trailing slash', () => {
      expect(validator.resolve('http://localhost:5173/', allowlist)).toBe(
        'http://localhost:5173',
      );
    });

    it('accepts a registered target carrying its own query string', () => {
      expect(
        validator.resolve('https://app.example.com/cb?x=1', allowlist),
      ).toBe('https://app.example.com/cb');
    });

    // The open redirect this whole class exists to close.
    it.each([
      'https://evil.com',
      'https://app.example.com.evil.com/cb',
      'https://app.example.com/cb/../../evil',
      'http://localhost:5174',
      'https://app.example.com/other',
    ])('rejects unregistered target %s', (requested) => {
      expect(() => validator.resolve(requested, allowlist)).toThrow(
        InvalidRedirectUriError,
      );
    });

    it('rejects everything when the application has no registrations', () => {
      expect(() => validator.resolve('https://app.example.com/cb', [])).toThrow(
        InvalidRedirectUriError,
      );
    });
  });

  describe('appendParams', () => {
    it('adds parameters and skips nulls', () => {
      expect(
        validator.appendParams('https://app.example.com/cb', {
          token: 'abc',
          state: null,
        }),
      ).toBe('https://app.example.com/cb?token=abc');
    });

    it('preserves parameters already on the target', () => {
      expect(
        validator.appendParams('https://app.example.com/cb?keep=1', {
          token: 'abc',
        }),
      ).toBe('https://app.example.com/cb?keep=1&token=abc');
    });
  });
});
