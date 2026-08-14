import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { ProviderExchangeError } from '../common/errors';
import { asRecord, asString, NormalizedProfile } from './profile';
import { ResolvedProviderConfig } from './provider-config.resolver';

const REQUEST_TIMEOUT_MS = 10_000;

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

export interface AuthorizationUrlParams {
  config: ResolvedProviderConfig;
  redirectUri: string;
  state: string;
  codeChallenge: string | null;
  nonce: string | null;
}

/**
 * Minimal OAuth2 authorization-code client.
 *
 * Written by hand rather than pulled from `openid-client` or `arctic`: both are
 * ESM-only and this backend compiles to CommonJS, and both model a client as a
 * long-lived object built from static configuration — the opposite of resolving
 * credentials per request from the database.
 */
@Injectable()
export class OAuthClientService {
  private readonly logger = new Logger(OAuthClientService.name);

  createPkcePair(): PkcePair {
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return { codeVerifier, codeChallenge };
  }

  buildAuthorizationUrl({
    config,
    redirectUri,
    state,
    codeChallenge,
    nonce,
  }: AuthorizationUrlParams): string {
    const url = new URL(config.authorizationUrl);

    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);

    if (config.scopes.length > 0) {
      url.searchParams.set('scope', config.scopes.join(' '));
    }

    if (codeChallenge) {
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }

    if (nonce) {
      url.searchParams.set('nonce', nonce);
    }

    for (const [key, value] of Object.entries(config.authorizationParams)) {
      url.searchParams.set(key, value);
    }

    return url.toString();
  }

  /**
   * Exchanges the authorization code for an access token.
   *
   * Credentials go in the form body, which every supported provider accepts;
   * `Accept: application/json` is required or GitHub answers with a
   * form-encoded body.
   */
  async exchangeCode(params: {
    config: ResolvedProviderConfig;
    clientSecret: string;
    code: string;
    redirectUri: string;
    codeVerifier: string | null;
  }): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: params.config.clientId,
      client_secret: params.clientSecret,
    });

    if (params.codeVerifier) {
      body.set('code_verifier', params.codeVerifier);
    }

    const payload = await this.fetchJson(params.config.tokenUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const record = asRecord(payload);
    const accessToken = asString(record?.access_token);

    if (!accessToken) {
      // Providers report failures with a 200 and an `error` field as often as
      // with a 4xx, so the token's absence is the reliable signal.
      const error = asString(record?.error) ?? 'missing access_token';
      throw new ProviderExchangeError(
        `Token exchange with ${params.config.slug} failed: ${error}`,
      );
    }

    return accessToken;
  }

  async fetchProfile(
    config: ResolvedProviderConfig,
    accessToken: string,
  ): Promise<NormalizedProfile> {
    const raw = await this.fetchJson(config.userinfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...config.userinfoHeaders,
      },
    });

    const profile = await config.mapProfile(raw, {
      accessToken,
      fetchJson: (url, init) => this.fetchJson(url, init),
    });

    if (!profile.providerAccountId) {
      throw new ProviderExchangeError(
        `Provider ${config.slug} returned a profile without an account identifier`,
      );
    }

    return profile;
  }

  private async fetchJson(
    url: string,
    init: RequestInit = {},
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'error',
      });
    } catch (error) {
      this.logger.warn(
        `Request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ProviderExchangeError(`Could not reach the provider at ${url}`);
    }

    const text = await response.text();

    if (!response.ok) {
      this.logger.warn(
        `Provider request to ${url} returned ${response.status}: ${text.slice(0, 200)}`,
      );
      throw new ProviderExchangeError(
        `Provider responded with status ${response.status}`,
      );
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      // An HTML error page here usually means a misconfigured generic endpoint.
      throw new ProviderExchangeError(
        `Provider at ${url} returned a non-JSON response`,
      );
    }
  }
}
