import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { PublicController } from './public.controller';

@Module({
  imports: [ApplicationsModule],
  controllers: [PublicController],
})
export class PublicModule {}
