# Auth Service

A multi-tenant OAuth2 authentication service. Applications register through an
admin panel and bring their own provider credentials — nothing about a provider
lives in the environment.

Built with NestJS + Prisma/Postgres (backend) and Next.js (frontend).

## Project Structure

- `backend` — NestJS API: the OAuth2 client, token issuing, and the admin API.
- `frontend` — Next.js: the public sign-in page and the admin panel at `/admin`.
- `test-app` — a small consumer application showing the integration.

## How it works

1. An admin registers an **application** and gets a client id, a JWKS URL and a
   signing key.
2. They add one or more **login providers** to it — Google, Discord, GitHub, or
   any OpenID Connect / OAuth2 endpoint — pasting that provider's client id and
   secret. Secrets are encrypted before they are stored.
3. They register the **redirect URIs** the application is allowed to return to.
4. The consumer application sends users to the sign-in page, which renders the
   buttons that application actually has configured.

Two applications can use two different Google projects at the same time; users
are scoped to the application they signed into.

## Getting started with Docker Compose

```bash
cp .env.example .env
# Fill in POSTGRES_PASSWORD, ADMIN_BOOTSTRAP_PASSWORD and generate a key:
openssl rand -base64 32   # -> ENCRYPTION_KEY
docker compose up --build
```

The backend applies migrations and creates the bootstrap admin on start.

- Sign-in page: http://localhost:3430/?app=&lt;slug&gt;
- Admin panel: http://localhost:3430/admin
- API: http://localhost:4000 (docs at `/docs`)

Sign in to the admin panel with `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD`,
then change the password and remove those variables from the environment.

## Local development

```bash
# Postgres
docker compose up -d postgres

# Backend
cd backend
cp ../.env.example .env      # point DATABASE_URL at localhost
npm install
npx prisma migrate dev
npm run db:seed
npm run start:dev

# Frontend
cd ../frontend
npm install
npm run dev
```

## Configuration

Only infrastructure roots are environment variables — see `.env.example`.
Provider client ids and secrets, redirect URIs, token lifetimes and signing keys
are stored in the database and managed through the admin panel.

`ENCRYPTION_KEY` protects every stored secret. Losing it means every provider
secret must be re-entered. It can be rotated without downtime: keep both keys in
`ENCRYPTION_KEYS`, point `ENCRYPTION_ACTIVE_KEY_ID` at the new one, run
`npm run secrets:rewrap`, then drop the old key.

Note the limit of this protection: it defends against a stolen database dump or
backup, not against compromise of the backend process, which necessarily holds
the key in memory. Moving the key to a KMS is the next step, and the stored
format already records which key sealed each value to make that a drop-in change.

## Integration

See [INTEGRATION.md](./INTEGRATION.md). Consumers verify tokens offline against
the application's JWKS, or by calling `POST /auth/verify`.

## CI/CD

`.github/workflows/ci.yml` lints, tests (against a Postgres service container)
and builds both images, pushing to GHCR on `master`.
