import { Injectable, Logger } from '@nestjs/common';
import { Application, ProviderKind, User } from '@prisma/client';
import { ApplicationService } from '../applications/application.service';
import { TokenService } from '../applications/token.service';
import {
  AuthFlowError,
  MfaRequiredError,
  ProviderExchangeError,
} from '../common/errors';
import { SecretCryptoService } from '../crypto/secret-crypto.service';
import { MfaService } from '../mfa/mfa.service';
import { OAuthClientService } from '../oauth/oauth-client.service';
import { ProviderConfigResolver } from '../oauth/provider-config.resolver';
import { IdentityService } from '../users/identity.service';
import { AuthTransactionService } from './auth-transaction.service';
import { RedirectUriValidator } from './redirect-uri.validator';

/** Kinds that return an id_token and therefore accept a nonce. */
const NONCE_KINDS = new Set<ProviderKind>([
  ProviderKind.OIDC,
  ProviderKind.GOOGLE,
]);

export interface StartLoginParams {
  applicationSlug: string;
  providerSlug: string;
  redirectUri?: string;
  consumerState?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly applications: ApplicationService,
    private readonly providerConfig: ProviderConfigResolver,
    private readonly oauth: OAuthClientService,
    private readonly transactions: AuthTransactionService,
    private readonly identities: IdentityService,
    private readonly tokens: TokenService,
    private readonly redirectUris: RedirectUriValidator,
    private readonly crypto: SecretCryptoService,
    private readonly mfa: MfaService,
  ) {}

  /**
   * Begins a login. The redirect target is validated here, before the browser
   * ever leaves for the provider, so an unregistered target fails as an error
   * rather than as a redirect.
   */
  async startLogin(params: StartLoginParams): Promise<string> {
    const application = await this.applications.findActiveBySlug(
      params.applicationSlug,
    );
    const provider = await this.applications.findEnabledProvider(
      application.id,
      params.providerSlug,
    );

    const redirectUri = this.redirectUris.resolve(
      params.redirectUri,
      application.redirectUris.map((entry) => entry.uri),
    );

    const config = this.providerConfig.resolve(provider);
    const { codeVerifier, codeChallenge } = this.oauth.createPkcePair();

    const transaction = await this.transactions.start({
      applicationId: application.id,
      applicationProviderId: provider.id,
      redirectUri,
      consumerState: params.consumerState ?? null,
      codeVerifier,
    });

    return this.oauth.buildAuthorizationUrl({
      config,
      redirectUri: this.applications.callbackUrl(provider.id),
      state: transaction.state,
      codeChallenge: config.usePkce ? codeChallenge : null,
      nonce: NONCE_KINDS.has(config.kind) ? transaction.nonce : null,
    });
  }

  /**
   * Completes a login and returns the URL to send the browser back to.
   *
   * Every outcome after the transaction has been claimed is reported to the
   * consumer application through its own registered redirect URI, so a failure
   * mid-flow lands the user back where they started rather than on a JSON body.
   */
  async completeLogin(params: {
    applicationProviderId: string;
    code?: string;
    state?: string;
    error?: string;
  }): Promise<string> {
    const provider = await this.applications.findProviderById(
      params.applicationProviderId,
    );

    // Claimed before the exchange, so a replayed callback cannot reach the
    // provider's token endpoint at all.
    const transaction = await this.transactions.consume(
      params.state,
      provider.id,
    );

    const finish = (result: Record<string, string | null>): string =>
      this.redirectUris.appendParams(transaction.redirectUri, {
        ...result,
        state: transaction.consumerState,
      });

    if (params.error) {
      this.logger.warn(
        `Provider ${provider.slug} reported "${params.error}" for application ${provider.applicationId}`,
      );
      return finish({ error: params.error });
    }

    if (!params.code) {
      return finish({ error: 'missing_code' });
    }

    try {
      const application = await this.applications.findById(
        provider.applicationId,
      );
      const config = this.providerConfig.resolve(provider);

      const accessToken = await this.oauth.exchangeCode({
        config,
        clientSecret: this.crypto.open(config.clientSecretEnc),
        code: params.code,
        redirectUri: this.applications.callbackUrl(provider.id),
        codeVerifier: config.usePkce ? transaction.codeVerifier : null,
      });

      const profile = await this.oauth.fetchProfile(config, accessToken);
      const user = await this.identities.resolveUser(
        application,
        provider,
        profile,
      );

      if (await this.mfa.isChallengeRequired(application, user.id)) {
        return this.beginMfa(
          {
            application,
            user,
            applicationProviderId: provider.id,
            redirectUri: transaction.redirectUri,
            consumerState: transaction.consumerState,
          },
          finish,
        );
      }

      const issued = await this.tokens.issue({
        application,
        user,
        providerSlug: provider.slug,
        mfa: false,
      });

      return finish({ token: issued.accessToken });
    } catch (error) {
      if (error instanceof AuthFlowError) {
        this.logger.warn(
          `Login through ${provider.slug} failed: ${error.code} — ${error.message}`,
        );
        return finish({ error: error.code });
      }

      this.logger.error(
        `Unexpected failure completing login through ${provider.slug}`,
        error instanceof Error ? error.stack : String(error),
      );
      return finish({ error: new ProviderExchangeError('').code });
    }
  }

  /**
   * Completes a login that owed a second factor, and returns where to send the
   * browser next.
   *
   * The token is minted here rather than at the callback, so a provider
   * response captured in a browser's history is worth nothing without a code.
   */
  async completeMfaChallenge(
    token: string,
    code: string,
  ): Promise<{ redirectUrl: string; recoveryCodes: string[] | null }> {
    const { challenge, factor, recoveryCodes } =
      await this.mfa.completeChallenge(token, code);

    // Re-read both sides: an admin may have blocked the user or disabled the
    // provider in the minutes the challenge was open.
    const [application, provider, user] = await Promise.all([
      this.applications.findById(challenge.applicationId),
      this.applications.findProviderById(challenge.applicationProviderId),
      this.identities.findActiveUser(challenge.userId),
    ]);

    const issued = await this.tokens.issue({
      application,
      user,
      providerSlug: provider.slug,
      mfa: true,
    });

    this.logger.log(`Second factor accepted for user ${user.id} via ${factor}`);

    return {
      redirectUrl: this.redirectUris.appendParams(challenge.redirectUri, {
        token: issued.accessToken,
        state: challenge.consumerState,
      }),
      recoveryCodes,
    };
  }

  /**
   * Parks a login on a challenge.
   *
   * With a frontend origin configured the browser goes to the hosted prompt,
   * which finishes the login itself; without one the handle is handed to the
   * consumer application, which collects the code and calls
   * `POST /auth/mfa/verify` on its own.
   */
  private async beginMfa(
    params: {
      application: Application;
      user: User;
      applicationProviderId: string;
      redirectUri: string;
      consumerState: string | null;
    },
    finish: (result: Record<string, string | null>) => string,
  ): Promise<string> {
    const token = await this.mfa.startChallenge(params);

    return (
      this.mfa.hostedChallengeUrl(token) ??
      finish({ mfa_token: token, error: new MfaRequiredError('').code })
    );
  }
}
