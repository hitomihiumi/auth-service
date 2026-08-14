import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ApplicationsModule } from '../applications/applications.module';
import { OAuthModule } from '../oauth/oauth.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTransactionService } from './auth-transaction.service';
import { RedirectUriValidator } from './redirect-uri.validator';
import { TokenService } from './token.service';

@Module({
  imports: [
    ApplicationsModule,
    OAuthModule,
    UsersModule,
    // Registered without a key: every signature uses the per-application key
    // passed at call time, so there is no global signing secret any more.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTransactionService,
    TokenService,
    RedirectUriValidator,
  ],
  exports: [TokenService],
})
export class AuthModule {}
