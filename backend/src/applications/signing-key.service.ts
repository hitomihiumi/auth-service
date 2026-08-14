import { Injectable, Logger } from '@nestjs/common';
import { ApplicationSigningKey, Prisma } from '@prisma/client';
import {
  createHash,
  createPublicKey,
  generateKeyPair,
  KeyObject,
} from 'node:crypto';
import { promisify } from 'node:util';
import { SecretCryptoService } from '../crypto/secret-crypto.service';
import { PrismaService } from '../prisma/prisma.service';

const generateKeyPairAsync = promisify(generateKeyPair);

/** Grace period during which a retired key is still published over JWKS. */
const RETIREMENT_SKEW_SECONDS = 300;

export interface GeneratedKeyMaterial {
  kid: string;
  algorithm: string;
  publicKeyPem: string;
  privateKeyEnc: string;
}

export interface Jwk {
  kty: string;
  n: string;
  e: string;
  kid: string;
  alg: string;
  use: 'sig';
}

/**
 * Per-application RSA keys.
 *
 * Asymmetric rather than a shared secret: a symmetric per-application key would
 * have to be handed to every consumer that wants to verify a token locally,
 * which is precisely the secret-sharing problem the verify endpoint exists to
 * avoid. With RS256 the private half never leaves this service and consumers
 * verify against the published JWKS.
 */
@Injectable()
export class SigningKeyService {
  private readonly logger = new Logger(SigningKeyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: SecretCryptoService,
  ) {}

  /** Generates a key pair and seals the private half. Does not touch the database. */
  async generate(): Promise<GeneratedKeyMaterial> {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    return {
      kid: this.deriveKid(publicKey),
      algorithm: 'RS256',
      publicKeyPem: publicKey,
      privateKeyEnc: this.crypto.seal(privateKey),
    };
  }

  /**
   * Rotates the application's key: a new key becomes active while the previous
   * one keeps being published until every token it signed has expired.
   */
  async rotate(
    applicationId: string,
    tokenTtlSeconds: number,
  ): Promise<ApplicationSigningKey> {
    const material = await this.generate();
    const retiredAt = new Date();
    const expiresAt = new Date(
      retiredAt.getTime() + (tokenTtlSeconds + RETIREMENT_SKEW_SECONDS) * 1000,
    );

    const [, created] = await this.prisma.$transaction([
      this.prisma.applicationSigningKey.updateMany({
        where: { applicationId, isActive: true },
        data: { isActive: false, retiredAt, expiresAt },
      }),
      this.prisma.applicationSigningKey.create({
        data: { applicationId, ...material },
      }),
    ]);

    this.logger.log(
      `Rotated signing key for application ${applicationId}; new kid ${created.kid}`,
    );

    return created;
  }

  async getActiveKey(
    applicationId: string,
  ): Promise<ApplicationSigningKey | null> {
    return this.prisma.applicationSigningKey.findFirst({
      where: { applicationId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Keys a consumer may still legitimately encounter in a token header. */
  async listPublishableKeys(
    applicationId: string,
  ): Promise<ApplicationSigningKey[]> {
    return this.prisma.applicationSigningKey.findMany({
      where: {
        applicationId,
        OR: [{ isActive: true }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  openPrivateKey(key: ApplicationSigningKey): string {
    return this.crypto.open(key.privateKeyEnc);
  }

  /** Prisma input for creating an application's first key inline. */
  async initialKeyCreateInput(): Promise<Prisma.ApplicationSigningKeyCreateWithoutApplicationInput> {
    return this.generate();
  }

  toJwk(key: ApplicationSigningKey): Jwk {
    const jwk = createPublicKey(key.publicKeyPem).export({ format: 'jwk' }) as {
      n?: string;
      e?: string;
    };

    return {
      kty: 'RSA',
      n: jwk.n ?? '',
      e: jwk.e ?? '',
      kid: key.kid,
      alg: key.algorithm,
      use: 'sig',
    };
  }

  /** Stable identifier derived from the key itself, so it never collides. */
  private deriveKid(publicKeyPem: string): string {
    const der = createPublicKey(publicKeyPem).export({
      type: 'spki',
      format: 'der',
    });

    return createHash('sha256').update(der).digest('base64url').slice(0, 22);
  }

  /** Exposed for tests that need a KeyObject rather than PEM. */
  static toKeyObject(pem: string): KeyObject {
    return createPublicKey(pem);
  }
}
