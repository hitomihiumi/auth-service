import { Injectable } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { UserDocument } from '../user/user.schema';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

  generateJwt(user: UserDocument) {
    const payload = {
      username: user.username,
      sub: user._id,
      avatar: user.avatar,
      email: user.email
    };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async validateDiscordUser(data: {
    providerId: string;
    username: string;
    email: string;
    avatar: string;
  }) {
    let user = await this.userService.findByID(data.providerId);
    if (!user) {
      const { providerId, email, username, avatar } = data;
      user = await this.userService.create({
        provider: 'discord',
        providerId,
        email,
        username,
        avatar,
      });
    } else {
      // Update user specifically for avatar since it might change
      user = await this.userService.update(data.providerId, {
        avatar: data.avatar,
        username: data.username,
      });
    }
    return user;
  }

  async validateGoogleUser(data: {
    providerId: string;
    username: string;
    email: string;
    avatar: string;
  }) {
    let user = await this.userService.findByID(data.providerId);
    if (!user) {
      const { providerId, email, username, avatar } = data;
      user = await this.userService.create({
        provider: 'google',
        providerId,
        email,
        username,
        avatar,
      });
    } else {
      // Update user specifically for avatar since it might change
      user = await this.userService.update(data.providerId, {
        avatar: data.avatar,
        username: data.username,
      });
    }
    return user;
  }
}
