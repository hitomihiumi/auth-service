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

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/public/applications/:identifier/providers` | Login options, for a custom sign-in page |
| `GET` | `/auth/:appSlug/:providerSlug/start` | Begin a login (`redirect_uri`, `state`) |
| `GET` | `/auth/callback/:providerId` | Provider callback — registered upstream, not called by you |
| `GET` | `/auth/:appSlug/.well-known/jwks.json` | Public keys |
| `POST` | `/auth/verify` | Server-side token check |

Interactive documentation is at `/docs`.

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
