import { Module } from '@nestjs/common';
import { OAuthClientService } from './oauth-client.service';
import { ProviderConfigResolver } from './provider-config.resolver';

@Module({
  providers: [OAuthClientService, ProviderConfigResolver],
  exports: [OAuthClientService, ProviderConfigResolver],
})
export class OAuthModule {}
