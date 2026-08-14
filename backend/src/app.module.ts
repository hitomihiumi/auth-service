import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { ApplicationsModule } from './applications/applications.module';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { validateEnv } from './config/env.validation';
import { CryptoModule } from './crypto/crypto.module';
import { PrismaModule } from './prisma/prisma.module';
import { PublicModule } from './public/public.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Under test the environment is set up by the suite; reading a developer's
      // .env on top of it would silently override values like PUBLIC_BASE_URL.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      // Fails the process at boot listing every problem, instead of surfacing a
      // missing variable as an error on the first request that needs it.
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ name: 'default', limit: 100, ttl: 60_000 }]),
    PrismaModule,
    CryptoModule,
    ApplicationsModule,
    UsersModule,
    AuthModule,
    PublicModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
