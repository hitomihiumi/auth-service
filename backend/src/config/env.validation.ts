import { z } from 'zod';

/**
 * A base64-encoded 32-byte AES-256 key.
 */
const encryptionKey = z.string().refine(
  (value) => {
    try {
      return Buffer.from(value, 'base64').length === 32;
    } catch {
      return false;
    }
  },
  { message: 'must be 32 bytes encoded as base64' },
);

/**
 * Only infrastructure roots live here. Provider credentials and signing keys are
 * stored in the database and managed through the admin panel, so nothing in this
 * schema is per-provider or per-application.
 */
const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    APP_PORT: z.coerce.number().int().positive().default(4000),

    /** Origin of this service. Becomes the JWT `iss` and prefixes callback URLs. */
    PUBLIC_BASE_URL: z.url(),

    /** Comma-separated browser origins allowed to call the API with credentials. */
    ALLOWED_ORIGINS: z.string().optional(),

    DATABASE_URL: z.string().min(1),

    /** Single-key form. Normalised into a keyring with id "1". */
    ENCRYPTION_KEY: encryptionKey.optional(),
    /** Keyring form: {"1":"<base64>","2":"<base64>"}. Enables key rotation. */
    ENCRYPTION_KEYS: z.string().optional(),
    ENCRYPTION_ACTIVE_KEY_ID: z.string().optional(),

    /** Consumed once by the seed script, then may be removed. */
    ADMIN_BOOTSTRAP_EMAIL: z.email().optional(),
    ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12).optional(),

    ENABLE_SWAGGER: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
  })
  .superRefine((env, ctx) => {
    if (!env.ENCRYPTION_KEY && !env.ENCRYPTION_KEYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['ENCRYPTION_KEY'],
        message:
          'either ENCRYPTION_KEY or ENCRYPTION_KEYS must be set — provider secrets cannot be stored without it',
      });
    }

    if (env.ENCRYPTION_KEYS && !env.ENCRYPTION_ACTIVE_KEY_ID) {
      ctx.addIssue({
        code: 'custom',
        path: ['ENCRYPTION_ACTIVE_KEY_ID'],
        message: 'required when ENCRYPTION_KEYS is used',
      });
    }

    // Falling back to a wildcard origin was the old behaviour; with cookie-based
    // admin sessions it is both invalid and unsafe, so production must be explicit.
    if (env.NODE_ENV === 'production' && !env.ALLOWED_ORIGINS) {
      ctx.addIssue({
        code: 'custom',
        path: ['ALLOWED_ORIGINS'],
        message: 'required in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Fails the process at boot with every problem listed at once, rather than
 * surfacing a missing variable as a runtime error on the first request.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}
