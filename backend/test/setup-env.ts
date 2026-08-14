import { config } from 'dotenv';

/**
 * Seeds the process environment for e2e runs.
 *
 * This must happen in a jest `setupFiles` entry rather than in `beforeAll`:
 * `ConfigModule.forRoot()` is evaluated when AppModule is imported, so it has
 * already snapshotted the environment by the time any hook runs.
 *
 * Values set here win over the local .env, because dotenv never overwrites an
 * existing variable — which is also how CI supplies its own DATABASE_URL.
 */
export const E2E_APP_PORT = 4010;
export const E2E_STUB_PORT = 4011;
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_APP_PORT}`;

process.env.NODE_ENV = 'test';
process.env.PUBLIC_BASE_URL = E2E_BASE_URL;
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 'test-key').toString('base64');

config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set to run the e2e suite');
}
