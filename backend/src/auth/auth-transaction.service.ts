import { Injectable, Logger } from '@nestjs/common';
import { AuthTransaction } from '@prisma/client';
import { InvalidAuthTransactionError } from '../common/errors';
import { SecretCryptoService } from '../crypto/secret-crypto.service';
import { PrismaService } from '../prisma/prisma.service';

const TRANSACTION_TTL_MS = 10 * 60 * 1000;

export interface StartedTransaction {
  state: string;
  codeVerifier: string;
  nonce: string;
}

/**
 * Owns the server-side login transaction.
 *
 * The OAuth `state` parameter used to *be* the redirect target, which is what
 * made the callback an open redirect. It is now an unguessable handle to a row
 * holding the already-validated target, so nothing a caller supplies reaches
 * the redirect unchecked.
 */
@Injectable()
export class AuthTransactionService {
  private readonly logger = new Logger(AuthTransactionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async start(params: {
    applicationId: string;
    applicationProviderId: string;
    redirectUri: string;
    consumerState: string | null;
    codeVerifier: string;
  }): Promise<StartedTransaction> {
    const state = SecretCryptoService.randomToken();
    const nonce = SecretCryptoService.randomToken(16);

    await this.prisma.authTransaction.create({
      data: {
        state,
        nonce,
        applicationId: params.applicationId,
        applicationProviderId: params.applicationProviderId,
        redirectUri: params.redirectUri,
        consumerState: params.consumerState,
        codeVerifier: params.codeVerifier,
        expiresAt: new Date(Date.now() + TRANSACTION_TTL_MS),
      },
    });

    return { state, codeVerifier: params.codeVerifier, nonce };
  }

  /**
   * Claims a transaction, atomically marking it used.
   *
   * The conditional update is the replay defence: two concurrent callbacks with
   * the same `state` cannot both see a row count of one. It runs before the
   * token exchange so a replayed code never reaches the provider.
   */
  async consume(
    state: string | undefined,
    applicationProviderId: string,
  ): Promise<AuthTransaction> {
    if (!state) {
      throw new InvalidAuthTransactionError('The state parameter is missing');
    }

    const transaction = await this.prisma.authTransaction.findUnique({
      where: { state },
    });

    if (!transaction) {
      throw new InvalidAuthTransactionError('Unknown login transaction');
    }

    if (transaction.applicationProviderId !== applicationProviderId) {
      // A state minted for one provider being presented at another's callback.
      throw new InvalidAuthTransactionError(
        'Login transaction does not belong to this provider',
      );
    }

    if (transaction.expiresAt.getTime() < Date.now()) {
      throw new InvalidAuthTransactionError('Login transaction has expired');
    }

    const claimed = await this.prisma.authTransaction.updateMany({
      where: { state, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    if (claimed.count !== 1) {
      throw new InvalidAuthTransactionError(
        'Login transaction has already been used',
      );
    }

    return transaction;
  }

  /** Housekeeping for rows whose flow was abandoned. */
  async pruneExpired(): Promise<number> {
    const { count } = await this.prisma.authTransaction.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    if (count > 0) {
      this.logger.log(`Pruned ${count} expired login transaction(s)`);
    }

    return count;
  }
}
