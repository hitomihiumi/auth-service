import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { AuthModule } from '../auth/auth.module';
import { RedirectUriValidator } from '../auth/redirect-uri.validator';
import { AdminApplicationsService } from './admin-applications.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminController } from './admin.controller';
import { AdminSessionGuard } from './admin-session.guard';

@Module({
  imports: [ApplicationsModule, AuthModule],
  controllers: [AdminController],
  providers: [
    AdminAuthService,
    AdminApplicationsService,
    AdminSessionGuard,
    RedirectUriValidator,
  ],
})
export class AdminModule {}
