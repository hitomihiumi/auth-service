import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new Logger('Bootstrap');
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // The admin panel authenticates with a cookie, and a wildcard origin is
  // invalid alongside credentials — so the allowlist is explicit, and config
  // validation already refuses to start production without one.
  const allowedOrigins = parseOrigins(config.get<string>('ALLOWED_ORIGINS'));
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
  });

  const enableSwagger =
    config.get<string>('NODE_ENV') !== 'production' ||
    config.get<boolean>('ENABLE_SWAGGER') === true;

  if (enableSwagger) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Auth Service')
        .setDescription(
          'Multi-tenant OAuth2 broker. Applications and their login providers ' +
            'are configured at runtime through the admin API.',
        )
        .setVersion('2.0')
        .addCookieAuth('admin_session')
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }

  app.enableShutdownHooks();

  const port = config.get<number>('APP_PORT') ?? 4000;
  await app.listen(port);

  logger.log(`Listening on port ${port}`);
  logger.log(`CORS origins: ${allowedOrigins.join(', ') || '(none)'}`);
  if (enableSwagger) {
    logger.log('API documentation at /docs');
  }
}

void bootstrap();
