import { ConfigService } from '@nestjs/config';
import { SecretCryptoService } from '../crypto/secret-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { MfaService } from './mfa.service';

/**
 * Where a login owing a code is sent. The rest of the service is exercised
 * against a real database by the e2e suite; this is the one decision that is
 * pure configuration.
 */
describe('MfaService.hostedChallengeUrl', () => {
  const build = (publicAppUrl?: string): MfaService =>
    new MfaService(
      {} as PrismaService,
      {} as SecretCryptoService,
      {
        get: (key: string) =>
          key === 'PUBLIC_APP_URL' ? publicAppUrl : undefined,
      } as ConfigService,
    );

  it('points at the hosted prompt when a frontend origin is configured', () => {
    const url = new URL(
      build('https://auth.example.com').hostedChallengeUrl(
        'handle-value',
      ) as string,
    );

    expect(`${url.origin}${url.pathname}`).toBe('https://auth.example.com/mfa');
    expect(url.searchParams.get('token')).toBe('handle-value');
  });

  it('tolerates a trailing slash on the configured origin', () => {
    expect(build('https://auth.example.com/').hostedChallengeUrl('x')).toBe(
      'https://auth.example.com/mfa?token=x',
    );
  });

  it('keeps a frontend served from a sub-path', () => {
    expect(build('https://example.com/auth').hostedChallengeUrl('x')).toBe(
      'https://example.com/auth/mfa?token=x',
    );
  });

  it('is null without one, which hands the challenge to the consumer', () => {
    expect(build().hostedChallengeUrl('handle-value')).toBeNull();
  });
});
