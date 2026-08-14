import {
  BadRequestException,
  Body,
  Controller,
  Get,
  GoneException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ApplicationService } from '../applications/application.service';
import {
  AuthFlowError,
  InvalidAuthTransactionError,
  InvalidRedirectUriError,
  UnknownApplicationError,
  UnknownProviderError,
} from '../common/errors';
import { AuthService } from './auth.service';
import {
  CallbackQueryDto,
  StartLoginQueryDto,
  VerifyTokenDto,
} from './dto/start-login.dto';
import { TokenService } from './token.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  /**
   * A malformed id is an unknown callback, not a server error — without this it
   * reaches the database as a bad uuid and surfaces as a 500.
   */
  private static readonly providerIdPipe = new ParseUUIDPipe({
    version: '4',
    exceptionFactory: () => new NotFoundException('Unknown callback'),
  });

  constructor(
    private readonly authService: AuthService,
    private readonly applications: ApplicationService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Public key set for an application, so consumers can verify tokens offline
   * instead of calling back into this service on every request.
   */
  @Get(':applicationSlug/.well-known/jwks.json')
  @ApiOperation({ summary: 'JWKS for an application' })
  async jwks(@Param('applicationSlug') applicationSlug: string) {
    const application = await this.resolveApplication(applicationSlug);
    return this.tokens.buildJwks(application.id);
  }

  @Get(':applicationSlug/:providerSlug/start')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: "Begin a login through one of an application's providers",
  })
  async start(
    @Param('applicationSlug') applicationSlug: string,
    @Param('providerSlug') providerSlug: string,
    @Query() query: StartLoginQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const authorizationUrl = await this.authService.startLogin({
        applicationSlug,
        providerSlug,
        redirectUri: query.redirect_uri,
        consumerState: query.state,
      });

      res.redirect(HttpStatus.FOUND, authorizationUrl);
    } catch (error) {
      // Deliberately never a redirect: bouncing the browser to an unvalidated
      // target is the open redirect this endpoint exists to prevent.
      throw this.toHttpException(error);
    }
  }

  /**
   * Provider callback. The path carries the provider id because this URL is
   * registered by hand upstream and must not change when anything is renamed.
   */
  @Get('callback/:applicationProviderId')
  async callback(
    @Param('applicationProviderId', AuthController.providerIdPipe)
    applicationProviderId: string,
    @Query() query: CallbackQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const redirectUrl = await this.authService.completeLogin({
        applicationProviderId,
        code: query.code,
        state: query.state,
        error: query.error,
      });

      res.redirect(HttpStatus.FOUND, redirectUrl);
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify a token issued for an application' })
  async verify(@Body() body: VerifyTokenDto) {
    const application = await this.resolveApplication(body.application);

    try {
      const payload = await this.tokens.verify(body.token, application);

      return {
        valid: true,
        payload: {
          sub: payload.sub,
          app: payload.app,
          provider: payload.provider,
          username: payload.username,
          email: payload.email,
          email_verified: payload.email_verified,
          avatar: payload.avatar,
          exp: payload.exp,
        },
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /**
   * The pre-multi-tenant entry points. Answering 410 rather than 404 tells an
   * integrator their URL was retired, not mistyped.
   */
  @Get(['google/login', 'discord/login', 'google/redirect', 'discord/redirect'])
  legacyRoutes(): never {
    throw new GoneException(
      'This endpoint was removed. Logins are now per-application: ' +
        'GET /auth/{applicationSlug}/{providerSlug}/start. See INTEGRATION.md.',
    );
  }

  private async resolveApplication(identifier: string) {
    try {
      return await this.applications.findActiveBySlugOrClientId(identifier);
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  private toHttpException(error: unknown): Error {
    if (
      error instanceof UnknownApplicationError ||
      error instanceof UnknownProviderError
    ) {
      return new NotFoundException(error.message);
    }

    if (
      error instanceof InvalidRedirectUriError ||
      error instanceof InvalidAuthTransactionError
    ) {
      return new BadRequestException({
        error: error.code,
        message: error.message,
      });
    }

    if (error instanceof AuthFlowError) {
      return new BadRequestException({
        error: error.code,
        message: error.message,
      });
    }

    return error instanceof Error ? error : new Error(String(error));
  }
}
