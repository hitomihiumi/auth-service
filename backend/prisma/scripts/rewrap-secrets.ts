import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import {
  buildKeyring,
  openSecret,
  sealSecret,
  sealedKeyId,
} from '../../src/crypto/envelope';

const BATCH_SIZE = 100;

/**
 * Re-wraps every stored secret under the active root key.
 *
 * Because secrets are envelope-encrypted, this only decrypts and re-encrypts
 * each per-secret data key — the plaintext secrets are never all held at once.
 *
 * Usage: keep both the old and new keys in ENCRYPTION_KEYS, point
 * ENCRYPTION_ACTIVE_KEY_ID at the new one, run this, then drop the old key.
 */
async function main(): Promise<void> {
  const keyring = buildKeyring({
    encryptionKey: process.env.ENCRYPTION_KEY,
    encryptionKeys: process.env.ENCRYPTION_KEYS,
    activeKeyId: process.env.ENCRYPTION_ACTIVE_KEY_ID,
  });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
  });

  const rewrap = (blob: string): string | null =>
    sealedKeyId(blob) === keyring.activeKeyId
      ? null
      : sealSecret(openSecret(blob, keyring), keyring);

  try {
    console.log(`Re-wrapping secrets under key "${keyring.activeKeyId}"`);

    let providersUpdated = 0;
    for (let skip = 0; ; skip += BATCH_SIZE) {
      const batch = await prisma.applicationProvider.findMany({
        select: { id: true, clientSecretEnc: true },
        orderBy: { id: 'asc' },
        skip,
        take: BATCH_SIZE,
      });

      if (batch.length === 0) {
        break;
      }

      for (const provider of batch) {
        const next = rewrap(provider.clientSecretEnc);
        if (next) {
          await prisma.applicationProvider.update({
            where: { id: provider.id },
            data: { clientSecretEnc: next },
          });
          providersUpdated += 1;
        }
      }
    }

    let keysUpdated = 0;
    for (let skip = 0; ; skip += BATCH_SIZE) {
      const batch = await prisma.applicationSigningKey.findMany({
        select: { id: true, privateKeyEnc: true },
        orderBy: { id: 'asc' },
        skip,
        take: BATCH_SIZE,
      });

      if (batch.length === 0) {
        break;
      }

      for (const key of batch) {
        const next = rewrap(key.privateKeyEnc);
        if (next) {
          await prisma.applicationSigningKey.update({
            where: { id: key.id },
            data: { privateKeyEnc: next },
          });
          keysUpdated += 1;
        }
      }
    }

    console.log(
      `Re-wrapped ${providersUpdated} provider secret(s) and ${keysUpdated} signing key(s).`,
    );
    console.log('The previous key can now be removed from ENCRYPTION_KEYS.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
