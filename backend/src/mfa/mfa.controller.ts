import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  InvalidMfaChallengeError,
  InvalidMfaCodeError,
  MfaNotAvailableError,
} from '../common/errors';
import { MfaCodeDto, StartEnrollmentDto } from './dto/mfa.dto';
import { MfaService } from './mfa.service';
import type { AuthenticatedUser } from './user-token.guard';
import { CurrentUser, UserTokenGuard } from './user-token.guard';

const uuid = new ParseUUIDPipe({ version: '4' });

/**
 * Self-service for end users, authenticated with the access token this service
 * issued them. A consumer application forwards its user here — it never holds
 * the shared secret itself.
 */
@ApiTags('mfa')
@ApiBearerAuth()
@Controller('mfa')
@UseGuards(UserTokenGuard)
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @Get()
  @ApiOperation({ summary: 'Second factors registered for the caller' })
  status(@CurrentUser() caller: AuthenticatedUser) {
    return this.mfa.status(caller.application, caller.user.id);
  }

  @Post('totp')
  @ApiOperation({
    summary: 'Begin enrolling an authenticator app',
    description:
      'Returns the shared secret and the otpauth:// URI to render as a QR ' +
      'code. Nothing is enforced until the enrolment is confirmed.',
  })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async enrol(
    @CurrentUser() caller: AuthenticatedUser,
    @Body() dto: StartEnrollmentDto,
  ) {
    try {
      return await this.mfa.beginEnrollment(
        caller.application,
        caller.user,
        dto.label,
      );
    } catch (error) {
      throw toHttpException(error);
    }
  }

  @Post('totp/:credentialId/confirm')
  @ApiOperation({
    summary: 'Confirm an enrolment with a code from the app',
    description:
      'Recovery codes are returned when this is the first factor, and are ' +
      'the only time they are shown.',
  })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async confirm(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('credentialId', uuid) credentialId: string,
    @Body() dto: MfaCodeDto,
  ) {
    try {
      return await this.mfa.confirmEnrollment(
        caller.application,
        caller.user,
        credentialId,
        dto.code,
      );
    } catch (error) {
      throw toHttpException(error);
    }
  }

  @Post('totp/:credentialId/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove an authenticator app',
    description:
      'A confirmed app costs a current code, so a stolen access token cannot ' +
      'strip the factor guarding the account it came from.',
  })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async remove(
    @CurrentUser() caller: AuthenticatedUser,
    @Param('credentialId', uuid) credentialId: string,
    @Body() dto: MfaCodeDto,
  ): Promise<void> {
    try {
      await this.mfa.removeCredential(caller.user, credentialId, dto.code);
    } catch (error) {
      throw toHttpException(error);
    }
  }

  @Post('recovery-codes')
  @ApiOperation({
    summary: 'Replace the recovery codes',
    description: 'Every previously issued code stops working.',
  })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async regenerateRecoveryCodes(
    @CurrentUser() caller: AuthenticatedUser,
    @Body() dto: MfaCodeDto,
  ) {
    try {
      return {
        recoveryCodes: await this.mfa.regenerateRecoveryCodes(
          caller.user,
          dto.code,
        ),
      };
    } catch (error) {
      throw toHttpException(error);
    }
  }
}

/**
 * Domain errors become statuses here rather than redirects: unlike the login
 * flow, these endpoints answer an application's own settings screen.
 */
function toHttpException(error: unknown): Error {
  if (error instanceof MfaNotAvailableError) {
    return new ForbiddenException({
      error: error.code,
      message: error.message,
    });
  }

  if (error instanceof InvalidMfaChallengeError) {
    return new NotFoundException({ error: error.code, message: error.message });
  }

  if (error instanceof InvalidMfaCodeError) {
    return new BadRequestException({
      error: error.code,
      message: error.message,
    });
  }

  return error instanceof Error ? error : new Error(String(error));
}
