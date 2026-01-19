import { Controller, Request, Post, UseGuards, Get, Res } from '@nestjs/common';
import { AuthService } from './auth/auth.service';
import express from 'express';
import {GoogleAuthGuard} from './auth/google.guard';
import {DiscordAuthGuard} from './auth/discord.guard';

@Controller()
export class AppController {
  constructor(private readonly authService: AuthService) {
  }

  @UseGuards(GoogleAuthGuard)
  @Get('auth/google/login')
  async googleLogin(@Request() req) {
    // Initiates the Google OAuth2 flow
  }

  @UseGuards(GoogleAuthGuard)
  @Get('auth/google/redirect')
  async googleRedirect(@Request() req, @Res() res: express.Response) {
    const jwt = await this.authService.generateJwt(req.user);
    // State is passed back by Google in query
    let redirectUrl = req.query.state || 'http://localhost:3000';

    // Ensure redirectUrl is absolute to avoid redirecting to backend's own relative path (localhost:4000)
    if (!redirectUrl.startsWith('http')) {
       redirectUrl = `http://localhost:3000${redirectUrl.startsWith('/') ? '' : '/'}${redirectUrl}`;
    }

    res.redirect(`${redirectUrl}?token=${jwt.access_token}`);
  }

  @UseGuards(DiscordAuthGuard)
  @Get('auth/discord/login')
  async discordLogin(@Request() req) {
    // Initiates the Discord OAuth2 flow
  }

  @UseGuards(DiscordAuthGuard)
  @Get('auth/discord/redirect')
  async discordRedirect(@Request() req, @Res() res: express.Response) {
    const jwt = await this.authService.generateJwt(req.user);
    let redirectUrl = req.query.state || 'http://localhost:3000';

    // Ensure redirectUrl is absolute
    if (!redirectUrl.startsWith('http')) {
       redirectUrl = `http://localhost:3000${redirectUrl.startsWith('/') ? '' : '/'}${redirectUrl}`;
    }

    res.redirect(`${redirectUrl}?token=${jwt.access_token}`);
  }
}
