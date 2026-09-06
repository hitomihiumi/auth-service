import { validateEnv } from './env.validation';

/** The variables every configuration needs, so a case can vary one thing. */
const BASE = {
  DATABASE_URL: 'postgresql://user:pass@postgres:5432/auth_service',
  PUBLIC_BASE_URL: 'http://localhost:4000',
  ENCRYPTION_KEY: Buffer.alloc(32, 'k').toString('base64'),
};

describe('validateEnv', () => {
  it('accepts the minimum a deployment has to supply', () => {
    const env = validateEnv({ ...BASE });

    expect(env.NODE_ENV).toBe('development');
    expect(env.APP_PORT).toBe(4000);
    expect(env.ENABLE_SWAGGER).toBe(false);
  });

  /**
   * Compose renders `- VAR=${VAR:-}` as an empty string rather than leaving the
   * variable out, which used to fail the boot on a variable nobody had set.
   */
  it.each([
    'ENABLE_SWAGGER',
    'ADMIN_BOOTSTRAP_EMAIL',
    'ADMIN_BOOTSTRAP_PASSWORD',
    'ENCRYPTION_KEYS',
    'ENCRYPTION_ACTIVE_KEY_ID',
    'PUBLIC_APP_URL',
  ])('treats a blank %s as unset rather than as a bad value', (key) => {
    expect(() => validateEnv({ ...BASE, [key]: '' })).not.toThrow();
  });

  it('treats whitespace as blank too', () => {
    expect(validateEnv({ ...BASE, PUBLIC_APP_URL: '  ' }).PUBLIC_APP_URL).toBe(
      undefined,
    );
  });

  it('still rejects a value that is present and wrong', () => {
    expect(() => validateEnv({ ...BASE, ENABLE_SWAGGER: 'yes' })).toThrow(
      /ENABLE_SWAGGER/,
    );
    expect(() => validateEnv({ ...BASE, PUBLIC_APP_URL: 'not-a-url' })).toThrow(
      /PUBLIC_APP_URL/,
    );
  });

  it('reads the two boolean spellings it does accept', () => {
    expect(
      validateEnv({ ...BASE, ENABLE_SWAGGER: 'true' }).ENABLE_SWAGGER,
    ).toBe(true);
    expect(
      validateEnv({ ...BASE, ENABLE_SWAGGER: 'false' }).ENABLE_SWAGGER,
    ).toBe(false);
  });

  it('lists every problem at once instead of the first', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: 'x', PUBLIC_BASE_URL: 'not-a-url' }),
    ).toThrow(/PUBLIC_BASE_URL[\s\S]*ENCRYPTION_KEY/);
  });

  it('requires an encryption key, since nothing can be stored without one', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: BASE.DATABASE_URL,
        PUBLIC_BASE_URL: BASE.PUBLIC_BASE_URL,
        ENCRYPTION_KEY: '',
      }),
    ).toThrow(/ENCRYPTION_KEY/);
  });

  it('requires an explicit origin allowlist in production', () => {
    expect(() =>
      validateEnv({ ...BASE, NODE_ENV: 'production', ALLOWED_ORIGINS: '' }),
    ).toThrow(/ALLOWED_ORIGINS/);

    expect(() =>
      validateEnv({
        ...BASE,
        NODE_ENV: 'production',
        ALLOWED_ORIGINS: 'https://app.example.com',
      }),
    ).not.toThrow();
  });

  it('requires an active key id alongside a keyring', () => {
    const keys = JSON.stringify({ '1': BASE.ENCRYPTION_KEY });

    expect(() =>
      validateEnv({ ...BASE, ENCRYPTION_KEYS: keys, ENCRYPTION_KEY: '' }),
    ).toThrow(/ENCRYPTION_ACTIVE_KEY_ID/);
  });
});
