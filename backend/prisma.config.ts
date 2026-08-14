import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 reads migration/introspection settings from here rather than from
 * the schema file. The runtime connection is made separately, by the driver
 * adapter constructed in PrismaService.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
});
