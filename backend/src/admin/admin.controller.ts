import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AdminUser } from '@prisma/client';
import type { Request, Response } from 'express';
import { ADMIN_SESSION_COOKIE, AdminAuthService } from './admin-auth.service';
import { AdminApplicationsService } from './admin-applications.service';
import { AdminSessionGuard, CurrentAdmin } from './admin-session.guard';
import { AdminLoginDto, ChangePasswordDto } from './dto/admin-auth.dto';
import {
  CreateApplicationDto,
  CreateRedirectUriDto,
  ListQueryDto,
  UpdateApplicationDto,
} from './dto/application.dto';
import {
  CreateProviderDto,
  RotateSecretDto,
  UpdateProviderDto,
} from './dto/provider.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly service: AdminApplicationsService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------- sessions

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Open an admin session' })
  async login(
    @Body() dto: AdminLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { token, expiresAt, admin } = await this.adminAuth.login({
      email: dto.email,
      password: dto.password,
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
    });

    response.cookie(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get<string>('NODE_ENV') === 'production',
      path: '/',
      expires: expiresAt,
    });

    return { email: admin.email, role: admin.role, expiresAt };
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const cookies = request.cookies as Record<string, string> | undefined;
    await this.adminAuth.logout(cookies?.[ADMIN_SESSION_COOKIE]);
    response.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' });
  }

  @Get('auth/me')
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  me(@CurrentAdmin() admin: AdminUser) {
    return { id: admin.id, email: admin.email, role: admin.role };
  }

  @Post('auth/change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  async changePassword(
    @CurrentAdmin() admin: AdminUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.adminAuth.changePassword(
      admin,
      dto.currentPassword,
      dto.newPassword,
    );
    // Every session was revoked, including this one.
    response.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' });
  }

  // ------------------------------------------------------------ applications

  @Get('provider-kinds')
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Provider catalog backing the admin provider form' })
  providerKinds() {
    return this.service.listProviderKinds();
  }

  @Get('applications')
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  listApplications(@Query() query: ListQueryDto) {
    return this.service.list(query);
  }

  @Post('applications')
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Register an application and mint its first signing key',
  })
  createApplication(@Body() dto: CreateApplicationDto) {
    return this.service.create(dto);
  }

  @Get('applications/:id')
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  getApplication(@Param('id', uuid) id: string) {
    return this.service.get(id);
  }

  @Patch('applications/:id')
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  updateApplication(
    @Param('id', uuid) id: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete('applications/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Delete an application and everything belonging to it',
    description:
      'Requires ?confirm=<slug> to guard against an accidental cascade.',
  })
  async deleteApplication(
    @Param('id', uuid) id: string,
    @Query('confirm') confirm?: string,
  ): Promise<void> {
    const application = await this.service.get(id);

    if (confirm !== application.slug) {
      throw new BadRequestException(
        `Deleting removes all users and providers; pass ?confirm=${application.slug} to proceed`,
      );
    }

    await this.service.remove(id);
  }

  @Post('applications/:id/signing-keys/rotate')
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Rotate the signing key',
    description:
      'The previous key keeps being published over JWKS until the tokens it signed expire.',
  })
  rotateSigningKey(@Param('id', uuid) id: string) {
    return this.service.rotateSigningKey(id);
  }

  // ----------------------------------------------------------- redirect URIs

  @Post('applications/:id/redirect-uris')
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  addRedirectUri(
    @Param('id', uuid) id: string,
    @Body() dto: CreateRedirectUriDto,
  ) {
    return this.service.addRedirectUri(id, dto);
  }

  @Delete('applications/:id/redirect-uris/:uriId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  removeRedirectUri(
    @Param('id', uuid) id: string,
    @Param('uriId', uuid) uriId: string,
  ): Promise<void> {
    return this.service.removeRedirectUri(id, uriId);
  }

  // --------------------------------------------------------------- providers

  @Post('applications/:id/providers')
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Add a login provider',
    description:
      'Returns the callback URL to register with the upstream provider. The ' +
      'client secret is stored encrypted and is never returned.',
  })
  createProvider(
    @Param('id', uuid) id: string,
    @Body() dto: CreateProviderDto,
  ) {
    return this.service.createProvider(id, dto);
  }

  @Get('providers/:providerId')
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  getProvider(@Param('providerId', uuid) providerId: string) {
    return this.service.getProvider(providerId);
  }

  @Patch('providers/:providerId')
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  updateProvider(
    @Param('providerId', uuid) providerId: string,
    @Body() dto: UpdateProviderDto,
  ) {
    return this.service.updateProvider(providerId, dto);
  }

  @Post('providers/:providerId/rotate-secret')
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  rotateProviderSecret(
    @Param('providerId', uuid) providerId: string,
    @Body() dto: RotateSecretDto,
  ) {
    return this.service.rotateProviderSecret(providerId, dto.clientSecret);
  }

  @Delete('providers/:providerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  removeProvider(@Param('providerId', uuid) providerId: string): Promise<void> {
    return this.service.removeProvider(providerId);
  }

  // ------------------------------------------------------------------- users

  @Get('applications/:id/users')
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  listUsers(@Param('id', uuid) id: string, @Query() query: ListQueryDto) {
    return this.service.listUsers(id, query);
  }

  @Post('users/:userId/mfa/reset')
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: "Clear a user's second factors",
    description:
      'For a user who has lost both their authenticator app and their ' +
      'recovery codes. They enrol again on their next sign-in if the ' +
      'application requires a factor.',
  })
  resetUserMfa(@Param('userId', uuid) userId: string) {
    return this.service.resetUserMfa(userId);
  }

  @Patch('users/:userId/blocked')
  @UseGuards(AdminSessionGuard)
  @ApiCookieAuth()
  setUserBlocked(
    @Param('userId', uuid) userId: string,
    @Body('isBlocked') isBlocked: boolean,
  ) {
    return this.service.setUserBlocked(userId, isBlocked === true);
  }
}
