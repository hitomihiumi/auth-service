# Built from the repository root, not from frontend/:
#   docker build -f frontend/Dockerfile .

FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY test-app/package.json test-app/
# --ignore-scripts keeps the backend's `prisma generate` postinstall out of a
# frontend-only build; nothing the frontend needs relies on install scripts.
RUN pnpm install --frozen-lockfile --filter @hitomihiumi/auth-frontend... --ignore-scripts

FROM deps AS build
COPY frontend frontend

# Baked into the client bundle at build time, so they are arguments rather than
# runtime environment.
ARG NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_FRONTEND_URL
ENV NEXT_PUBLIC_FRONTEND_URL=$NEXT_PUBLIC_FRONTEND_URL

RUN pnpm --filter @hitomihiumi/auth-frontend run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3430
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache dumb-init

# The standalone bundle carries its own minimal node_modules; static assets are
# served from disk and are not part of it.
COPY --from=build --chown=node:node /repo/frontend/.next/standalone ./
COPY --from=build --chown=node:node /repo/frontend/.next/static ./frontend/.next/static

USER node

EXPOSE 3430
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "frontend/server.js"]
