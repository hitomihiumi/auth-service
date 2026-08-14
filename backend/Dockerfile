# Built from the repository root, not from backend/: the pnpm lockfile and the
# sibling workspace manifests live there.
#   docker build -f backend/Dockerfile .

FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY test-app/package.json test-app/
# The backend's postinstall runs `prisma generate`, so the schema has to be in
# place before install — not only after the sources are copied.
COPY backend/prisma backend/prisma
COPY backend/prisma.config.ts backend/
RUN pnpm install --frozen-lockfile --filter @hitomihiumi/auth-backend...

FROM deps AS build
COPY backend backend
RUN pnpm --filter @hitomihiumi/auth-backend run build

# Resolves the workspace into a flat, production-only tree. `--legacy` is
# required: pnpm 10 otherwise refuses to deploy from a workspace that does not
# set inject-workspace-packages.
FROM build AS prune
RUN pnpm deploy --legacy --filter @hitomihiumi/auth-backend --prod /prod

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
 && apt-get install -y --no-install-recommends dumb-init \
 && rm -rf /var/lib/apt/lists/*

COPY --from=prune --chown=node:node /prod/node_modules ./node_modules
COPY --from=prune --chown=node:node /prod/package.json ./
COPY --from=build --chown=node:node /repo/backend/dist ./dist
COPY --from=build --chown=node:node /repo/backend/prisma ./prisma
COPY --from=build --chown=node:node /repo/backend/prisma.config.ts ./
COPY --chown=node:node backend/docker-entrypoint.sh ./

# Generated here rather than copied from an earlier stage: under pnpm the client
# is written inside the virtual store of whichever tree ran the generator, so a
# copy would silently produce an image without one. The prisma CLI is a
# production dependency, so this works against the deployed tree.
RUN ./node_modules/.bin/prisma generate && chown -R node:node ./node_modules

RUN chmod +x docker-entrypoint.sh
USER node

EXPOSE 4000
ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
