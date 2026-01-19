import { Strategy } from "passport-google-oauth20";
import { PassportStrategy } from "@nestjs/passport"
import { Injectable } from "@nestjs/common"
import { AuthService } from "./auth.service"

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
    constructor(private readonly authService: AuthService) {
    super({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
        scope: ["profile", "email"],
    })
    }

    async validate(accessToken: string, refreshToken: string, profile: any, done: Function) {
        const { id, displayName, emails, photos } = profile
        const email = emails && emails.length > 0 ? emails[0].value : null;
        const avatar = photos && photos.length > 0 ? photos[0].value : null;
        const user = await this.authService.validateGoogleUser({
            providerId: id,
            username: displayName,
            email,
            avatar
        })
        done(null, user)
    }
}