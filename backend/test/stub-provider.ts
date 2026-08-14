import express from 'express';
import type { Server } from 'node:http';

export interface StubProfile {
  sub: string;
  email?: string;
  email_verified?: boolean;
  preferred_username?: string;
  picture?: string;
}

export interface StubProvider {
  port: number;
  baseUrl: string;
  /** Profile returned by the next /userinfo call. */
  setProfile(profile: StubProfile): void;
  /** Parameters the last /authorize call received, for asserting PKCE etc. */
  lastAuthorizeQuery(): Record<string, string>;
  lastTokenBody(): Record<string, string>;
  close(): Promise<void>;
}

/**
 * A minimal OAuth2 authorization server, so the login flow can be exercised
 * end to end without reaching a real identity provider.
 */
export async function startStubProvider(port: number): Promise<StubProvider> {
  const app = express();
  app.use(express.urlencoded({ extended: false }));

  let profile: StubProfile = { sub: 'stub-user-1' };
  let authorizeQuery: Record<string, string> = {};
  let tokenBody: Record<string, string> = {};

  app.get('/authorize', (req, res) => {
    authorizeQuery = req.query as Record<string, string>;
    const redirectUri = authorizeQuery.redirect_uri ?? '';
    const state = authorizeQuery.state ?? '';

    res.redirect(
      302,
      `${redirectUri}?code=stub-authorization-code&state=${encodeURIComponent(state)}`,
    );
  });

  app.post('/token', (req, res) => {
    tokenBody = req.body as Record<string, string>;
    res.json({ access_token: 'stub-access-token', token_type: 'Bearer' });
  });

  app.get('/userinfo', (req, res) => {
    if (req.headers.authorization !== 'Bearer stub-access-token') {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }
    res.json(profile);
  });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(port, () => resolve(s));
  });

  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    setProfile: (next) => {
      profile = next;
    },
    lastAuthorizeQuery: () => authorizeQuery,
    lastTokenBody: () => tokenBody,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
