import { Strategy } from "passport-discord"
import { PassportStrategy } from "@nestjs/passport"
import { Injectable } from "@nestjs/common"
import { AuthService } from "./auth.service"

@Injectable()
export class DiscordStrategy extends PassportStrategy(Strategy, "discord") {
    constructor(private readonly authService: AuthService) {
    super({
        clientID: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        callbackURL: process.env.DISCORD_CALLBACK_URL,
        scope: ["identify", "email"],
    })
    }

    async validate(accessToken: string, refreshToken: string, profile: any, done: Function) {
        const { id, username, email, avatar } = profile;
        const avatarUrl = avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png` : null;
        const user = await this.authService.validateDiscordUser({
            providerId: id,
            username,
            email,
            avatar: avatarUrl,
        })
        done(null, user)
    }
}