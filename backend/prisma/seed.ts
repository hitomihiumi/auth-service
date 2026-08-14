import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import 'dotenv/config';

const MIN_PASSWORD_LENGTH = 12;

/**
 * Creates the first admin so the panel can be reached on a fresh database.
 *
 * A password-based local account rather than an env-driven allowlist checked
 * against an OAuth login: providers are configured *through* the panel, so on
 * an empty database there is no provider to sign in with. Idempotent, so it is
 * safe to run on every deploy.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL ?? '',
    }),
  });

  try {
    const existing = await prisma.adminUser.count();

    if (existing > 0) {
      console.log(`Admin users already exist (${existing}); skipping bootstrap.`);
      return;
    }

    const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
    const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

    if (!email || !password) {
      throw new Error(
        'No admin users exist and ADMIN_BOOTSTRAP_EMAIL / ADMIN_BOOTSTRAP_PASSWORD are not set',
      );
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `ADMIN_BOOTSTRAP_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }

    const admin = await prisma.adminUser.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        role: 'OWNER',
      },
    });

    console.log(`Bootstrap admin created: ${admin.email}`);
    console.log(
      'Change this password via POST /admin/auth/change-password and remove ' +
        'ADMIN_BOOTSTRAP_* from the environment.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
