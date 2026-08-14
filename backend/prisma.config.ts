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
    // Development convenience only. The production image has no ts-node, so it
    // runs the compiled dist/scripts/seed-admin.js from its entrypoint instead.
    seed: 'ts-node src/scripts/seed-admin.ts',
  },
});
