import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';
import { UserTokenGuard } from './user-token.guard';

/**
 * Depends on ApplicationsModule for token verification only; the login flow
 * depends on this module, so nothing here may reach back into AuthModule.
 */
@Module({
  imports: [ApplicationsModule],
  controllers: [MfaController],
  providers: [MfaService, UserTokenGuard],
  exports: [MfaService],
})
export class MfaModule {}
