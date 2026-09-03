# Auth Service

A multi-tenant OAuth2 authentication service. Applications register through an
admin panel and bring their own provider credentials — nothing about a provider
lives in the environment.

Built with NestJS + Prisma/Postgres (backend) and Next.js (frontend).

## Project Structure

A pnpm workspace with three packages:

- `backend` — NestJS API: the OAuth2 client, token issuing, and the admin API.
- `frontend` — Next.js: the public sign-in page and the admin panel at `/admin`.
- `test-app` — a small consumer application showing the integration.

Install once from the repository root; there is a single lockfile.

```bash
corepack enable      # provides the pinned pnpm version
pnpm install
```

## How it works

1. An admin registers an **application** and gets a client id, a JWKS URL and a
   signing key.
2. They add one or more **login providers** to it — Google, Discord, GitHub, or
   any OpenID Connect / OAuth2 endpoint — pasting that provider's client id and
   secret. Secrets are encrypted before they are stored.
3. They register the **redirect URIs** the application is allowed to return to.
4. They choose whether logins need a code from an **authenticator app** — off,
   optional, or required for everyone.
5. The consumer application sends users to the sign-in page, which renders the
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
- Second-factor prompt: http://localhost:3430/mfa (reached mid-login)
- Admin panel: http://localhost:3430/admin
- API: http://localhost:4000 (docs at `/docs`)

Sign in to the admin panel with `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD`,
then change the password and remove those variables from the environment.

## Local development

```bash
pnpm install
docker compose up -d postgres

# Backend — point DATABASE_URL at localhost in backend/.env
cp .env.example backend/.env
pnpm db:migrate
pnpm db:seed
pnpm dev:backend

# Frontend, in another shell
pnpm dev:frontend
```

Useful root scripts: `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`.
To work inside one package directly, use
`pnpm --filter @hitomihiumi/auth-backend run <script>`.

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

## Two-factor authentication

Users register an authenticator app — Google Authenticator, Authy, 1Password or
any other TOTP app — and are asked for a six-digit code after their provider
login. Enrolment issues ten single-use recovery codes; an admin can clear a
user's factors when both are lost.

Each application picks its own policy in the admin panel: `DISABLED`,
`OPTIONAL` (the default — only enrolled users are challenged) or `REQUIRED`,
which enrols everyone else on their next sign-in.

The prompt is served by the frontend at `/mfa`, so consumer applications need
no changes: a login that owes a code simply reaches their `redirect_uri` a
little later, with `"mfa": true` in the token. Applications that would rather
collect the code themselves can leave `PUBLIC_APP_URL` unset and drive
`/auth/mfa/challenge` and `/auth/mfa/verify` — see
[INTEGRATION.md](./INTEGRATION.md).

Secrets are envelope-encrypted with the same key as everything else, and
recovery codes are stored as argon2id digests.

## Integration

See [INTEGRATION.md](./INTEGRATION.md). Consumers verify tokens offline against
the application's JWKS, or by calling `POST /auth/verify`.

## CI/CD

`.github/workflows/ci.yml` lints, tests (against a Postgres service container)
and builds both images, pushing to GHCR on `master`.

Both images build from the repository root, because the workspace lockfile and
the sibling manifests have to be inside the build context:

```bash
docker build -f backend/Dockerfile .
docker build -f frontend/Dockerfile .
```

The backend image applies migrations on start and, when `ADMIN_BOOTSTRAP_EMAIL`
is set, runs the compiled bootstrap-admin script. The frontend ships as a Next
standalone bundle.
