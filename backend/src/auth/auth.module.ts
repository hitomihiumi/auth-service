import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { MfaModule } from '../mfa/mfa.module';
import { OAuthModule } from '../oauth/oauth.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTransactionService } from './auth-transaction.service';
import { RedirectUriValidator } from './redirect-uri.validator';

@Module({
  imports: [ApplicationsModule, OAuthModule, UsersModule, MfaModule],
  controllers: [AuthController],
  providers: [AuthService, AuthTransactionService, RedirectUriValidator],
})
export class AuthModule {}
