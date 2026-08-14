# Built from the repository root, not from backend/: the pnpm lockfile and the
# sibling workspace manifests live there.
#   docker build -f backend/Dockerfile .

FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
WORKDIR /repo

FROM base AS deps
# argon2 ships prebuilt binaries, but node-gyp-build verifies one loads before
# using it and silently falls back to compiling when that check fails — which
# is what happens in this image. The toolchain makes that fallback succeed. It
# lives in the build stages only; the runtime image copies the built artifact.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

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

# Fail the build rather than the first admin login: argon2 is a native module,
# and a copy that does not load would otherwise only surface at runtime.
RUN node -e "require('argon2'); require('@prisma/client');" \
 && echo "native modules load"

RUN chmod +x docker-entrypoint.sh
USER node

EXPOSE 4000
ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
