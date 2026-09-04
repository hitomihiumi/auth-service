# Integration Guide

This service provides centralized OAuth2 authentication for your applications.
Each application registers its own login providers, so two applications can use
different Google or Discord credentials at the same time.

> **Breaking change from v1.** The previous single-tenant endpoints are gone and
> answer `410 Gone`. See [Migrating from v1](#migrating-from-v1) at the end.

## Registering your application

In the admin panel (`/admin`):

1. **Create an application.** The slug appears in your sign-in URL and cannot be
   changed afterwards. You receive a client id — this is the JWT `aud` claim.
2. **Add redirect URIs.** A login can only return to an address registered here;
   anything else is rejected before the provider is contacted. Comparison is on
   scheme, host, port and path — your own query string is preserved.
3. **Add a login provider.** For Google, Discord and GitHub you only supply the
   client id and secret. For anything else pick *OpenID Connect* or *OAuth 2.0*
   and fill in the authorization, token and userinfo endpoints.
4. **Register the callback URL** shown on the provider card with that provider
   (Google Cloud Console, Discord Developer Portal, and so on). Nothing can
   verify this step for you — if it is missed, sign-in fails with
   `redirect_uri_mismatch` from the provider.

## The sign-in flow

**1. Send the user to the sign-in page.**

```
https://auth.example.com/?app=<slug>&redirect_uri=<your-url>&state=<your-csrf-token>
```

`state` is opaque to this service and comes back untouched. Use it as your own
CSRF token — generate it, store it in `sessionStorage`, and compare on return.

**2. The user picks a provider.** The buttons are whatever that application has
configured; you do not need to know which providers exist.

**3. The browser comes back to your `redirect_uri`.**

On success:

```
https://your-app.example.com/callback?token=<jwt>&state=<your-csrf-token>
```

On failure, with `error` instead of `token`:

| `error` | Meaning |
|---|---|
| `email_already_registered` | The address is already used by another provider in this application, and account linking is off |
| `user_blocked` | An admin blocked this user |
| `invalid_state` | The login transaction expired, was replayed, or is unknown |
| `provider_error` | The upstream provider refused or failed |
| `missing_code` | The provider returned no authorization code |
| `invalid_mfa_challenge` | The second-factor prompt expired or was already answered |
| `mfa_attempts_exhausted` | Too many wrong codes; the sign-in has to start again |
| `mfa_required` | A code is owed and this service has no page to collect it — see [Two-factor authentication](#two-factor-authentication) |

**4. Verify the token.** Never trust a decoded token — decoding proves nothing
about the signature.

*Offline (preferred)* — verify against the application's JWKS:

```
GET https://auth.example.com/auth/<slug>/.well-known/jwks.json
```

Match the token header's `kid` to a key. Rotated keys stay published until the
tokens they signed expire, so rotation does not sign anyone out.

*Or ask the service:*

```http
POST /auth/verify
Content-Type: application/json

{ "token": "<jwt>", "application": "<slug or client id>" }
```

## Token claims

```json
{
  "iss": "https://auth.example.com",
  "aud": "<application client id>",
  "sub": "<user id, uuid>",
  "app": "<application slug>",
  "provider": "<provider slug>",
  "email": "user@example.com",
  "email_verified": true,
  "username": "Ada",
  "avatar": "https://…",
  "mfa": true,
  "ver": 2,
  "iat": 1700000000,
  "exp": 1700003600
}
```

Signed with **RS256** using a key belonging to that application. Always check
`aud` matches your client id — it is what distinguishes a token minted for your
application from one minted for another.

`sub` is unique **within an application**. The same person signing into two
applications is two users with two different `sub` values, by design.

`mfa` says whether a code from an authenticator app was checked as well as the
provider login. It was added alongside two-factor support and is additive — no
existing claim changed meaning, so `ver` stays at 2.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/public/applications/:identifier/providers` | Login options, for a custom sign-in page |
| `GET` | `/auth/:appSlug/:providerSlug/start` | Begin a login (`redirect_uri`, `state`) |
| `GET` | `/auth/callback/:providerId` | Provider callback — registered upstream, not called by you |
| `GET` | `/auth/:appSlug/.well-known/jwks.json` | Public keys |
| `POST` | `/auth/verify` | Server-side token check |
| `GET` | `/auth/mfa/challenge?token=` | State of a pending second factor |
| `POST` | `/auth/mfa/verify` | Spend a code and finish the sign-in |
| `GET` | `/mfa` | Second factors of the bearer of an access token |
| `POST` | `/mfa/totp` | Begin enrolling an authenticator app |
| `POST` | `/mfa/totp/:id/confirm` | Confirm it with a code |
| `POST` | `/mfa/totp/:id/remove` | Remove it (costs a current code) |
| `POST` | `/mfa/recovery-codes` | Replace the recovery codes |

Interactive documentation is at `/docs`.

## Two-factor authentication

Users can register an authenticator app — Google Authenticator, Authy,
1Password, Aegis, or anything else that speaks TOTP (RFC 6238) — and be asked
for a six-digit code after their provider login. An admin sets the policy per
application:

| Policy | Effect |
|---|---|
| `DISABLED` | Nobody is asked, even users who already enrolled |
| `OPTIONAL` (default) | Users may enrol; only those who did are asked |
| `REQUIRED` | Everyone is asked, and users without an app enrol on their next sign-in |

Codes are checked with a one-step window either side of the current one, and a
code is spent once accepted — the same six digits cannot sign in twice inside
the ninety seconds they remain valid.

### With the hosted sign-in page

**Nothing changes for your application.** A login that owes a code stops at the
service's own prompt at `<PUBLIC_APP_URL>/mfa`, and only reaches your
`redirect_uri` once the code is accepted — with the same `token` and `state` as
any other sign-in. The token then carries `"mfa": true`.

### Collecting the code yourself

If `PUBLIC_APP_URL` is not configured, the service has nowhere to send the
browser, so it hands the challenge back to you instead:

```
https://your-app.example.com/callback?mfa_token=<handle>&error=mfa_required&state=<your-csrf-token>
```

Read what to ask for, and for a first enrolment the secret to render as a QR
code:

```http
GET /auth/mfa/challenge?token=<handle>
```

```json
{
  "mode": "enrol",
  "application": { "slug": "acme", "name": "Acme" },
  "account": "ada@example.com",
  "enrollment": {
    "credentialId": "…",
    "secret": "JBSWY3DPEHPK3PXP",
    "otpauthUri": "otpauth://totp/Acme:ada@example.com?secret=…",
    "algorithm": "SHA1",
    "digits": 6,
    "period": 30
  },
  "attemptsRemaining": 5,
  "expiresAt": "2026-01-01T12:05:00.000Z"
}
```

`mode` is `verify` for an enrolled user, and `enrollment` is then `null`.
Then spend the code:

```http
POST /auth/mfa/verify
Content-Type: application/json

{ "token": "<handle>", "code": "123456" }
```

```json
{
  "redirectUrl": "https://your-app.example.com/callback?token=<jwt>&state=…",
  "recoveryCodes": ["abcde-fghjk", "…"]
}
```

Send the browser to `redirectUrl`. `recoveryCodes` is present only when the
challenge enrolled the user's first factor — show them once, then never again.

A challenge lasts five minutes and allows five wrong codes; a wrong one answers
`400` and can be retried, anything else means the sign-in has to start over.

### Letting users manage their own factors

These endpoints authenticate with the access token this service issued, so your
settings screen can call them directly with the token it already holds:

```http
POST /mfa/totp
Authorization: Bearer <jwt>
Content-Type: application/json

{ "label": "Phone" }
```

The response carries `secret` and `otpauthUri`; render the latter as a QR code.
Nothing is enforced until the user proves the app works:

```http
POST /mfa/totp/<credentialId>/confirm
Authorization: Bearer <jwt>

{ "code": "123456" }
```

which answers `{ "recoveryCodes": [...] }` for a first factor and
`{ "recoveryCodes": null }` for a second device. `GET /mfa` reports what is
registered, `POST /mfa/totp/<id>/remove` takes it away and
`POST /mfa/recovery-codes` replaces the codes — the last two require a current
code in the body, so a stolen access token cannot strip the factor guarding the
account it came from.

A user who has lost both their app and their recovery codes needs an admin, who
clears their factors from the application's user list in the admin panel.

## Building your own sign-in page

If you would rather not use the hosted page, read the provider list and link
straight to the start endpoint:

```js
const { providers } = await fetch(
  `${AUTH_URL}/public/applications/${slug}/providers`
).then((r) => r.json());

// <a href={`${AUTH_URL}/auth/${slug}/${p.slug}/start?redirect_uri=…&state=…`}>
```

## Migrating from v1

| v1 | Now |
|---|---|
| `GET /auth/google/login?state=<redirect target>` | `GET /auth/<slug>/google/start?redirect_uri=…&state=…` |
| `state` carried the redirect target | `redirect_uri` carries it, and must be pre-registered; `state` is yours again |
| Any URL accepted as a redirect target | Only registered URIs; anything else is a `400`, never a redirect |
| `GET /auth/verify?token=` | `POST /auth/verify` with `{ token, application }` |
| One global `JWT_SECRET`, HS256 | Per-application RS256 key, published over JWKS |
| `sub` was a Mongo ObjectId hex string | `sub` is a UUID, and unique per application |
| No `aud` / `iss` | Both present; check `aud` |
| Credentials from `.env` | Configured per application in the admin panel |

Tokens issued by v1 do not verify against v2 — the signing scheme changed. With
a one-hour lifetime, the window is one hour after deploying.

If you persisted the old `sub`, re-match users by email on their next sign-in;
the value is not preserved.
