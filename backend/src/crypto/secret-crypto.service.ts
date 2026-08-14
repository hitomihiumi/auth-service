import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { buildKeyring, Keyring, openSecret, sealSecret } from './envelope';

/**
 * Owns the root keyring and the sealing of every at-rest secret: OAuth client
 * secrets and application signing keys.
 */
@Injectable()
export class SecretCryptoService implements OnModuleInit {
  private readonly logger = new Logger(SecretCryptoService.name);
  private keyring!: Keyring;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.keyring = buildKeyring({
      encryptionKey: this.config.get<string>('ENCRYPTION_KEY'),
      encryptionKeys: this.config.get<string>('ENCRYPTION_KEYS'),
      activeKeyId: this.config.get<string>('ENCRYPTION_ACTIVE_KEY_ID'),
    });

    this.logger.log(
      `Secret encryption ready (active key "${this.keyring.activeKeyId}", ` +
        `${Object.keys(this.keyring.keys).length} key(s) in ring)`,
    );
  }

  seal(plaintext: string): string {
    return sealSecret(plaintext, this.keyring);
  }

  open(blob: string): string {
    return openSecret(blob, this.keyring);
  }

  getKeyring(): Keyring {
    return this.keyring;
  }

  /** Display-only tail so an admin can tell which secret is currently stored. */
  static last4(secret: string): string {
    return secret.slice(-4).padStart(4, '•');
  }

  /** URL-safe random token for OAuth state, PKCE verifiers and admin sessions. */
  static randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  /** Session cookies are stored only as a digest, never in the clear. */
  static sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
