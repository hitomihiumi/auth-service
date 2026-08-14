import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { createPublicKey, createVerify } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  E2E_APP_PORT as APP_PORT,
  E2E_BASE_URL as BASE_URL,
  E2E_STUB_PORT as STUB_PORT,
} from './setup-env';
import { startStubProvider, StubProvider } from './stub-provider';

const CONSUMER_REDIRECT = 'http://localhost:5173/callback';

const ADMIN_EMAIL = 'e2e-admin@example.com';
const ADMIN_PASSWORD = 'e2e-password-1234';

interface ProviderResponse {
  id: string;
  callbackUrl: string;
  clientSecretLast4: string;
}

interface ApplicationResponse {
  id: string;
  slug: string;
  clientId: string;
}

describe('Auth flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let stub: StubProvider;
  let cookie: string;

  const api = (path: string, init: RequestInit = {}): Promise<Response> =>
    fetch(`${BASE_URL}${path}`, { redirect: 'manual', ...init });

  const adminApi = (path: string, init: RequestInit = {}): Promise<Response> =>
    api(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        cookie,
        ...(init.headers ?? {}),
      },
    });

  async function createApplication(slug: string): Promise<{
    application: ApplicationResponse;
    provider: ProviderResponse;
  }> {
    const appResponse = await adminApi('/admin/applications', {
      method: 'POST',
      body: JSON.stringify({ name: `App ${slug}`, slug }),
    });
    const application = (await appResponse.json()) as ApplicationResponse;

    await adminApi(`/admin/applications/${application.id}/redirect-uris`, {
      method: 'POST',
      body: JSON.stringify({ uri: CONSUMER_REDIRECT }),
    });

    const providerResponse = await adminApi(
      `/admin/applications/${application.id}/providers`,
      {
        method: 'POST',
        body: JSON.stringify({
          kind: 'OAUTH2',
          slug: 'stub',
          displayName: 'Stub Provider',
          clientId: `client-${slug}`,
          clientSecret: `secret-for-${slug}`,
          authorizationUrl: `${stub.baseUrl}/authorize`,
          tokenUrl: `${stub.baseUrl}/token`,
          userinfoUrl: `${stub.baseUrl}/userinfo`,
          scopes: ['openid', 'email'],
        }),
      },
    );

    return {
      application,
      provider: (await providerResponse.json()) as ProviderResponse,
    };
  }

  /** Drives start -> provider -> callback and returns the final redirect URL. */
  async function login(
    slug: string,
    consumerState = 'consumer-state',
  ): Promise<URL> {
    const start = await api(
      `/auth/${slug}/stub/start?redirect_uri=${encodeURIComponent(CONSUMER_REDIRECT)}` +
        `&state=${consumerState}`,
    );
    expect(start.status).toBe(302);

    const providerRedirect = await fetch(
      start.headers.get('location') as string,
      {
        redirect: 'manual',
      },
    );
    expect(providerRedirect.status).toBe(302);

    const callback = await fetch(
      providerRedirect.headers.get('location') as string,
      {
        redirect: 'manual',
      },
    );
    expect(callback.status).toBe(302);

    return new URL(callback.headers.get('location') as string);
  }

  beforeAll(async () => {
    stub = await startStubProvider(STUB_PORT);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(APP_PORT);

    prisma = app.get(PrismaService);

    await prisma.adminUser.deleteMany({ where: { email: ADMIN_EMAIL } });
    await prisma.adminUser.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash: await argon2.hash(ADMIN_PASSWORD, {
          type: argon2.argon2id,
        }),
        role: 'OWNER',
      },
    });

    const loginResponse = await api('/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    cookie = (loginResponse.headers.get('set-cookie') as string).split(';')[0];
  }, 60_000);

  afterAll(async () => {
    await prisma.application.deleteMany({
      where: { slug: { in: ['e2e-alpha', 'e2e-beta'] } },
    });
    await prisma.adminUser.deleteMany({ where: { email: ADMIN_EMAIL } });
    await app.close();
    await stub.close();
  });

  beforeEach(() => {
    stub.setProfile({
      sub: 'stub-user-1',
      email: 'alice@example.com',
      email_verified: true,
      preferred_username: 'alice',
      picture: 'https://cdn.example.com/alice.png',
    });
  });

  it('completes a login and mints a token signed with the application key', async () => {
    const { application } = await createApplication('e2e-alpha');

    const redirect = await login('e2e-alpha');

    expect(`${redirect.origin}${redirect.pathname}`).toBe(CONSUMER_REDIRECT);
    expect(redirect.searchParams.get('state')).toBe('consumer-state');
    expect(redirect.searchParams.get('error')).toBeNull();

    const token = redirect.searchParams.get('token') as string;
    const [header, payload] = token
      .split('.')
      .slice(0, 2)
      .map(
        (part) =>
          JSON.parse(Buffer.from(part, 'base64url').toString()) as Record<
            string,
            unknown
          >,
      );

    expect(header.alg).toBe('RS256');
    expect(header.kid).toEqual(expect.any(String));
    expect(payload.aud).toBe(application.clientId);
    expect(payload.iss).toBe(BASE_URL);
    expect(payload.app).toBe('e2e-alpha');
    expect(payload.provider).toBe('stub');
    expect(payload.email).toBe('alice@example.com');
    expect(payload.ver).toBe(2);
    // The subject is now the local user id, not a provider account id.
    expect(payload.sub).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('sends PKCE and the client secret to the provider', async () => {
    await createApplication('e2e-beta');
    await login('e2e-beta');

    expect(stub.lastAuthorizeQuery().code_challenge_method).toBe('S256');
    expect(stub.lastAuthorizeQuery().code_challenge).toEqual(
      expect.any(String),
    );
    expect(stub.lastTokenBody().client_secret).toBe('secret-for-e2e-beta');
    expect(stub.lastTokenBody().code_verifier).toEqual(expect.any(String));
  });

  it('publishes a JWKS the issued token verifies against', async () => {
    const redirect = await login('e2e-alpha');
    const token = redirect.searchParams.get('token') as string;

    const jwks = (await (
      await api('/auth/e2e-alpha/.well-known/jwks.json')
    ).json()) as { keys: Array<{ kid: string; n: string; e: string }> };

    const [headerPart, payloadPart, signaturePart] = token.split('.');
    const header = JSON.parse(
      Buffer.from(headerPart, 'base64url').toString(),
    ) as { kid: string };
    const jwk = jwks.keys.find((key) => key.kid === header.kid);
    expect(jwk).toBeDefined();

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${headerPart}.${payloadPart}`);
    const valid = verifier.verify(
      createPublicKey({ key: { ...jwk, kty: 'RSA' }, format: 'jwk' }),
      Buffer.from(signaturePart, 'base64url'),
    );

    expect(valid).toBe(true);
  });

  it('accepts the token at the verify endpoint', async () => {
    const redirect = await login('e2e-alpha');
    const token = redirect.searchParams.get('token') as string;

    const ok = await api('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, application: 'e2e-alpha' }),
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { valid: boolean }).valid).toBe(true);

    const tampered = await api('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: `${token}x`, application: 'e2e-alpha' }),
    });
    expect(tampered.status).toBe(401);
  });

  it('reuses one user across repeated logins instead of duplicating', async () => {
    await login('e2e-alpha');
    await login('e2e-alpha');

    const application = await prisma.application.findUniqueOrThrow({
      where: { slug: 'e2e-alpha' },
      include: { users: { include: { identities: true } } },
    });

    expect(application.users).toHaveLength(1);
    expect(application.users[0]?.identities).toHaveLength(1);
    expect(application.users[0]?.lastLoginAt).not.toBeNull();
  });

  it('keeps users of different applications separate', async () => {
    await login('e2e-alpha');
    await login('e2e-beta');

    const [alpha, beta] = await Promise.all(
      ['e2e-alpha', 'e2e-beta'].map((slug) =>
        prisma.application.findUniqueOrThrow({
          where: { slug },
          include: { users: true },
        }),
      ),
    );

    // The same provider account and address in two applications is two users.
    expect(alpha?.users).toHaveLength(1);
    expect(beta?.users).toHaveLength(1);
    expect(alpha?.users[0]?.id).not.toBe(beta?.users[0]?.id);
    expect(alpha?.users[0]?.email).toBe(beta?.users[0]?.email);
  });

  it('rejects a replayed callback', async () => {
    const start = await api(
      `/auth/e2e-alpha/stub/start?redirect_uri=${encodeURIComponent(CONSUMER_REDIRECT)}`,
    );
    const providerRedirect = await fetch(
      start.headers.get('location') as string,
      {
        redirect: 'manual',
      },
    );
    const callbackUrl = providerRedirect.headers.get('location') as string;

    const first = await fetch(callbackUrl, { redirect: 'manual' });
    expect(first.status).toBe(302);

    const replay = await fetch(callbackUrl, { redirect: 'manual' });
    expect(replay.status).toBe(400);
  });

  it('rejects an unknown state', async () => {
    const provider = await prisma.applicationProvider.findFirstOrThrow({
      where: { application: { slug: 'e2e-alpha' }, slug: 'stub' },
    });

    const response = await api(
      `/auth/callback/${provider.id}?code=x&state=not-a-real-state`,
    );
    expect(response.status).toBe(400);
  });

  it('answers a malformed callback id with 404 rather than a server error', async () => {
    const response = await api('/auth/callback/not-a-uuid?code=x&state=y');
    expect(response.status).toBe(404);
  });

  it('refuses to start a login for an unregistered redirect target', async () => {
    const response = await api(
      `/auth/e2e-alpha/stub/start?redirect_uri=${encodeURIComponent('https://evil.com')}`,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('location')).toBeNull();
  });

  it('reports a duplicate email as an error redirect rather than a crash', async () => {
    const application = await prisma.application.findUniqueOrThrow({
      where: { slug: 'e2e-alpha' },
    });

    // A different provider account asserting an address another user holds.
    await adminApi(`/admin/applications/${application.id}/providers`, {
      method: 'POST',
      body: JSON.stringify({
        kind: 'OAUTH2',
        slug: 'stub2',
        displayName: 'Second Stub',
        clientId: 'client-two',
        clientSecret: 'secret-two',
        authorizationUrl: `${stub.baseUrl}/authorize`,
        tokenUrl: `${stub.baseUrl}/token`,
        userinfoUrl: `${stub.baseUrl}/userinfo`,
      }),
    });

    await login('e2e-alpha');
    stub.setProfile({
      sub: 'a-different-account',
      email: 'alice@example.com',
      email_verified: true,
    });

    const start = await api(
      `/auth/e2e-alpha/stub2/start?redirect_uri=${encodeURIComponent(CONSUMER_REDIRECT)}`,
    );
    const providerRedirect = await fetch(
      start.headers.get('location') as string,
      {
        redirect: 'manual',
      },
    );
    const callback = await fetch(
      providerRedirect.headers.get('location') as string,
      {
        redirect: 'manual',
      },
    );

    const redirect = new URL(callback.headers.get('location') as string);
    expect(redirect.searchParams.get('error')).toBe('email_already_registered');
    expect(redirect.searchParams.get('token')).toBeNull();
  });
});
