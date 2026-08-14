import { Module } from '@nestjs/common';
import { ApplicationService } from './application.service';
import { SigningKeyService } from './signing-key.service';

@Module({
  providers: [ApplicationService, SigningKeyService],
  exports: [ApplicationService, SigningKeyService],
})
export class ApplicationsModule {}
