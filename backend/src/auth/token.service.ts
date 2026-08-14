import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Application, User } from '@prisma/client';
import { Jwk, SigningKeyService } from '../applications/signing-key.service';

/** Claim set issued to consumer applications. */
export interface AccessTokenPayload {
  iss: string;
  aud: string;
  sub: string;
  app: string;
  provider: string;
  email: string | null;
  email_verified: boolean;
  username: string | null;
  avatar: string | null;
  /** Claim-set version, so a future change is detectable by consumers. */
  ver: number;
  iat: number;
  exp: number;
}

export interface IssuedToken {
  accessToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly signingKeys: SigningKeyService,
  ) {}

  /**
   * Signs a token with the application's own active key.
   *
   * `aud` carries the application, so a token minted for one consumer is no
   * longer indistinguishable from another's — which was the case when every
   * token was signed with one global secret.
   */
  async issue(params: {
    application: Application;
    user: User;
    providerSlug: string;
  }): Promise<IssuedToken> {
    const key = await this.signingKeys.getActiveKey(params.application.id);

    if (!key) {
      // Applications always get a key at creation, so this means the row was
      // tampered with or a rotation failed halfway.
      throw new Error(
        `Application ${params.application.slug} has no active signing key`,
      );
    }

    const expiresIn = params.application.tokenTtlSeconds;

    const accessToken = await this.jwt.signAsync(
      {
        app: params.application.slug,
        provider: params.providerSlug,
        email: params.user.email,
        email_verified: params.user.emailVerified,
        username: params.user.username,
        avatar: params.user.avatarUrl,
        ver: 2,
      },
      {
        algorithm: 'RS256',
        privateKey: this.signingKeys.openPrivateKey(key),
        keyid: key.kid,
        subject: params.user.id,
        audience: params.application.clientId,
        issuer: this.issuer(),
        expiresIn,
      },
    );

    return { accessToken, expiresIn, tokenType: 'Bearer' };
  }

  /**
   * Verifies a token against the issuing application's published keys, trying
   * retired-but-unexpired keys so a rotation does not invalidate live sessions.
   */
  async verify(
    token: string,
    application: Application,
  ): Promise<AccessTokenPayload> {
    const keys = await this.signingKeys.listPublishableKeys(application.id);

    if (keys.length === 0) {
      throw new Error(
        `Application ${application.slug} has no publishable keys`,
      );
    }

    let lastError: unknown;
    for (const key of keys) {
      try {
        return await this.jwt.verifyAsync<AccessTokenPayload>(token, {
          algorithms: ['RS256'],
          publicKey: key.publicKeyPem,
          audience: application.clientId,
          issuer: this.issuer(),
        });
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Token verification failed');
  }

  async buildJwks(applicationId: string): Promise<{ keys: Jwk[] }> {
    const keys = await this.signingKeys.listPublishableKeys(applicationId);
    return { keys: keys.map((key) => this.signingKeys.toJwk(key)) };
  }

  private issuer(): string {
    return this.config.getOrThrow<string>('PUBLIC_BASE_URL');
  }
}
