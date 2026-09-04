import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ApplicationService } from './application.service';
import { SigningKeyService } from './signing-key.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    // Registered without a key: every signature uses the per-application key
    // passed at call time, so there is no global signing secret any more.
    JwtModule.register({}),
  ],
  providers: [ApplicationService, SigningKeyService, TokenService],
  exports: [ApplicationService, SigningKeyService, TokenService],
})
export class ApplicationsModule {}
