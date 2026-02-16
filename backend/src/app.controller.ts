import {
  Controller,
  Request,
  UseGuards,
  Get,
  Res,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import express from 'express';
import { GoogleAuthGuard } from './auth/google.guard';
import { DiscordAuthGuard } from './auth/discord.guard';
import { UserDocument } from './user/user.schema';

interface RequestWithUser extends express.Request {
  user: UserDocument;
}

interface UserPayload {
  username: string;
  avatar?: string;
  sub: string;
  email: string;
}

@Controller()
export class AppController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Verify JWT token - allows external services to validate tokens without sharing secret
   */
  @Get('auth/verify')
  verifyToken(@Query('token') token: string) {
    if (!token) {
      throw new UnauthorizedException('Token is required');
    }

    try {
      const payload = this.jwtService.verify<UserPayload>(token);
      return {
        valid: true,
        payload: {
          sub: payload.sub,
          username: payload.username,
          email: payload.email,
          avatar: payload.avatar,
        },
      };
    } catch (error) {
      console.log(error);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  @UseGuards(GoogleAuthGuard)
  @Get('auth/google/login')
  async googleLogin() {
    // Initiates the Google OAuth2 flow
  }

  @UseGuards(GoogleAuthGuard)
  @Get('auth/google/redirect')
  googleRedirect(
    @Request() req: RequestWithUser,
    @Res() res: express.Response,
  ) {
    const jwt = this.authService.generateJwt(req.user);
    // State is passed back by Google in query
    let redirectUrl = (req.query.state as string) || 'http://localhost:3000';

    // Ensure redirectUrl is absolute to avoid redirecting to backend's own relative path (localhost:4000)
    if (!redirectUrl.startsWith('http')) {
      redirectUrl = `http://localhost:3000${redirectUrl.startsWith('/') ? '' : '/'}${redirectUrl}`;
    }

    res.redirect(`${redirectUrl}?token=${jwt.access_token}`);
  }

  @UseGuards(DiscordAuthGuard)
  @Get('auth/discord/login')
  async discordLogin() {
    // Initiates the Discord OAuth2 flow
  }

  @UseGuards(DiscordAuthGuard)
  @Get('auth/discord/redirect')
  discordRedirect(
    @Request() req: RequestWithUser,
    @Res() res: express.Response,
  ) {
    const jwt = this.authService.generateJwt(req.user);
    let redirectUrl = (req.query.state as string) || 'http://localhost:3000';

    // Ensure redirectUrl is absolute
    if (!redirectUrl.startsWith('http')) {
      redirectUrl = `http://localhost:3000${redirectUrl.startsWith('/') ? '' : '/'}${redirectUrl}`;
    }

    res.redirect(`${redirectUrl}?token=${jwt.access_token}`);
  }
}
