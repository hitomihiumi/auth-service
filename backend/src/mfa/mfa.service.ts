import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Application,
  MfaChallenge,
  MfaPolicy,
  Prisma,
  TotpCredential,
  User,
} from '@prisma/client';
import * as argon2 from 'argon2';
import {
  InvalidMfaChallengeError,
  InvalidMfaCodeError,
  MfaAttemptsExhaustedError,
  MfaNotAvailableError,
} from '../common/errors';
import { SecretCryptoService } from '../crypto/secret-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { generateRecoveryCodes, normalizeRecoveryCode } from './recovery-codes';
import {
  buildOtpAuthUri,
  generateTotpSecret,
  TOTP_DEFAULTS,
  TotpAlgorithm,
  TotpParameters,
  verifyTotp,
} from './totp';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * A six-digit code is a shade over twenty bits, and every login is a fresh
 * challenge. Throttling the endpoint is not enough on its own — the budget has
 * to belong to the challenge, so an attacker cannot spread guesses over many
 * requests against one pending login.
 */
const MAX_ATTEMPTS = 5;

const DEFAULT_LABEL = 'Authenticator';

/** How a code was satisfied, so the caller can log and claim it accurately. */
export type VerifiedFactor = 'totp' | 'recovery_code';

export interface TotpEnrollment {
  credentialId: string;
  label: string;
  secret: string;
  otpauthUri: string;
  algorithm: TotpAlgorithm;
  digits: number;
  period: number;
}

export interface MfaStatus {
  policy: MfaPolicy;
  /** True once at least one authenticator app is confirmed. */
  enabled: boolean;
  required: boolean;
  credentials: Array<{
    id: string;
    label: string;
    confirmedAt: Date | null;
    lastUsedAt: Date | null;
    createdAt: Date;
  }>;
  recoveryCodesRemaining: number;
}

export interface ChallengeView {
  /**
   * `verify` asks an already-enrolled user for a code; `enrol` is the first
   * login of a user of an application that requires a factor, and carries the
   * secret their app needs to scan.
   */
  mode: 'verify' | 'enrol';
  application: { slug: string; name: string };
  account: string;
  enrollment: TotpEnrollment | null;
  attemptsRemaining: number;
  expiresAt: Date;
}

export interface CompletedChallenge {
  challenge: MfaChallenge;
  factor: VerifiedFactor;
  /** Present only when the challenge enrolled the user's first factor. */
  recoveryCodes: string[] | null;
}

/**
 * Second factors from an authenticator app — Google Authenticator, Authy,
 * 1Password, Aegis and anything else that speaks RFC 6238.
 *
 * The provider login proves who someone is at Google or Discord; it says
 * nothing about whether that account is still theirs. This is the step that
 * stands between a stolen provider session and a token minted by this service,
 * so nothing here is issued until a code has been checked.
 */
@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: SecretCryptoService,
    private readonly config: ConfigService,
  ) {}

  // ------------------------------------------------------------ login flow

  /**
   * Whether a login that has just passed the provider still owes a code.
   *
   * `DISABLED` is a killswitch rather than a default: an admin who turns MFA
   * off for an application must not leave enrolled users locked out of it.
   */
  async isChallengeRequired(
    application: Pick<Application, 'id' | 'mfaPolicy'>,
    userId: string,
  ): Promise<boolean> {
    if (application.mfaPolicy === MfaPolicy.DISABLED) {
      return false;
    }

    if (application.mfaPolicy === MfaPolicy.REQUIRED) {
      return true;
    }

    return (await this.countConfirmed(userId)) > 0;
  }

  /**
   * Opens a challenge for a login that has otherwise completed.
   *
   * The handle is random and stored only as a digest, exactly like the OAuth
   * state it succeeds: a database dump must not contain live half-finished
   * logins.
   */
  async startChallenge(params: {
    application: Application;
    user: User;
    applicationProviderId: string;
    redirectUri: string;
    consumerState: string | null;
  }): Promise<string> {
    const token = SecretCryptoService.randomToken();

    // A user of a REQUIRED application with nothing enrolled has to be given a
    // secret here, or the policy would simply lock them out.
    const pending =
      (await this.countConfirmed(params.user.id)) === 0
        ? await this.createPendingCredential(params.user.id, DEFAULT_LABEL)
        : null;

    await this.prisma.mfaChallenge.create({
      data: {
        tokenHash: SecretCryptoService.sha256(token),
        applicationId: params.application.id,
        userId: params.user.id,
        applicationProviderId: params.applicationProviderId,
        redirectUri: params.redirectUri,
        consumerState: params.consumerState,
        totpCredentialId: pending?.id ?? null,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });

    return token;
  }

  /** What the code-entry page needs to render, resolved from the handle alone. */
  async describeChallenge(token: string): Promise<ChallengeView> {
    const challenge = await this.loadOpenChallenge(token);

    const [application, user, credential] = await Promise.all([
      this.prisma.application.findUniqueOrThrow({
        where: { id: challenge.applicationId },
        select: { slug: true, name: true },
      }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: challenge.userId },
        select: { email: true, username: true, id: true },
      }),
      challenge.totpCredentialId
        ? this.prisma.totpCredential.findUnique({
            where: { id: challenge.totpCredentialId },
          })
        : null,
    ]);

    const account = user.email ?? user.username ?? user.id;
    const enrolling = credential !== null && credential.confirmedAt === null;

    return {
      mode: enrolling ? 'enrol' : 'verify',
      application,
      account,
      enrollment:
        enrolling && credential
          ? this.describeEnrollment(credential, application.name, account)
          : null,
      attemptsRemaining: MAX_ATTEMPTS - challenge.attempts,
      expiresAt: challenge.expiresAt,
    };
  }

  /**
   * Spends a code against a challenge and claims it.
   *
   * The attempt is counted before the code is looked at, so a failure that
   * throws still costs the caller a guess.
   */
  async completeChallenge(
    token: string,
    code: string,
  ): Promise<CompletedChallenge> {
    const challenge = await this.loadOpenChallenge(token);

    const { attempts } = await this.prisma.mfaChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });

    if (attempts > MAX_ATTEMPTS) {
      await this.discardChallenge(challenge.id);
      throw new MfaAttemptsExhaustedError(
        'Too many incorrect codes; start the sign-in again',
      );
    }

    const pending = challenge.totpCredentialId
      ? await this.prisma.totpCredential.findUnique({
          where: { id: challenge.totpCredentialId },
        })
      : null;

    let factor: VerifiedFactor;
    let recoveryCodes: string[] | null = null;

    if (pending && pending.confirmedAt === null) {
      // Enrolment: the only secret that may satisfy this challenge is the one
      // the page just showed, and confirming it is what makes it a factor.
      const step = this.matchCredential(pending, code);

      if (step === null) {
        throw new InvalidMfaCodeError('That code did not match');
      }

      await this.confirmCredential(pending, step);
      recoveryCodes = await this.replaceRecoveryCodes(challenge.userId);
      factor = 'totp';
    } else {
      const verified = await this.verifyUserCode(challenge.userId, code);

      if (!verified) {
        throw new InvalidMfaCodeError('That code did not match');
      }

      factor = verified;
    }

    // Claimed last and conditionally, so two codes submitted at once cannot
    // both mint a token.
    const claimed = await this.prisma.mfaChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    if (claimed.count !== 1) {
      throw new InvalidMfaChallengeError(
        'This challenge has already been used',
      );
    }

    return { challenge, factor, recoveryCodes };
  }

  /**
   * Where to send the browser to collect the code.
   *
   * Null when no frontend origin is configured, which leaves the login to hand
   * the challenge back to the consumer application instead.
   */
  hostedChallengeUrl(token: string): string | null {
    const base = this.config.get<string>('PUBLIC_APP_URL');

    if (!base) {
      return null;
    }

    // Appended rather than resolved against the origin, so a frontend served
    // from a sub-path keeps it.
    const url = new URL(`${base.replace(/\/+$/, '')}/mfa`);
    url.searchParams.set('token', token);

    return url.toString();
  }

  // ------------------------------------------------------------- enrolment

  async status(
    application: Pick<Application, 'mfaPolicy'>,
    userId: string,
  ): Promise<MfaStatus> {
    const [credentials, recoveryCodesRemaining] = await Promise.all([
      this.prisma.totpCredential.findMany({
        where: { userId },
        select: {
          id: true,
          label: true,
          confirmedAt: true,
          lastUsedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } }),
    ]);

    return {
      policy: application.mfaPolicy,
      enabled: credentials.some((entry) => entry.confirmedAt !== null),
      required: application.mfaPolicy === MfaPolicy.REQUIRED,
      credentials,
      recoveryCodesRemaining,
    };
  }

  /**
   * Mints a secret for a new authenticator app. It is not a factor until
   * {@link confirmEnrollment} has seen a code from it, so an abandoned QR code
   * cannot leave an account unable to sign in.
   */
  async beginEnrollment(
    application: Application,
    user: User,
    label?: string,
  ): Promise<TotpEnrollment> {
    this.assertEnrolmentAllowed(application);

    const credential = await this.createPendingCredential(
      user.id,
      label?.trim() || DEFAULT_LABEL,
    );

    return this.describeEnrollment(
      credential,
      application.name,
      user.email ?? user.username ?? user.id,
    );
  }

  /**
   * Finishes enrolment. Returns recovery codes when this is the user's first
   * factor — the moment losing the phone starts to matter.
   */
  async confirmEnrollment(
    application: Application,
    user: User,
    credentialId: string,
    code: string,
  ): Promise<{ credentialId: string; recoveryCodes: string[] | null }> {
    this.assertEnrolmentAllowed(application);

    const credential = await this.prisma.totpCredential.findFirst({
      where: { id: credentialId, userId: user.id },
    });

    if (!credential) {
      throw new InvalidMfaChallengeError('No such enrolment');
    }

    if (credential.confirmedAt !== null) {
      throw new InvalidMfaChallengeError('This app is already confirmed');
    }

    const step = this.matchCredential(credential, code);

    if (step === null) {
      throw new InvalidMfaCodeError('That code did not match');
    }

    const first = (await this.countConfirmed(user.id)) === 0;
    await this.confirmCredential(credential, step);

    return {
      credentialId: credential.id,
      recoveryCodes: first ? await this.replaceRecoveryCodes(user.id) : null,
    };
  }

  /**
   * Removes an authenticator app. A confirmed one costs a current code: a
   * stolen access token must not be enough to strip the factor guarding the
   * account it came from.
   */
  async removeCredential(
    user: User,
    credentialId: string,
    code?: string,
  ): Promise<void> {
    const credential = await this.prisma.totpCredential.findFirst({
      where: { id: credentialId, userId: user.id },
    });

    if (!credential) {
      throw new InvalidMfaChallengeError('No such authenticator app');
    }

    if (credential.confirmedAt !== null) {
      await this.requireCode(user.id, code);
    }

    await this.prisma.totpCredential.delete({ where: { id: credential.id } });

    // The last app going means the recovery codes now unlock nothing but
    // themselves, so they go with it.
    if ((await this.countConfirmed(user.id)) === 0) {
      await this.prisma.mfaRecoveryCode.deleteMany({
        where: { userId: user.id },
      });
    }
  }

  /** Issues a fresh set and invalidates every previous one. */
  async regenerateRecoveryCodes(user: User, code: string): Promise<string[]> {
    await this.requireCode(user.id, code);
    return this.replaceRecoveryCodes(user.id);
  }

  /**
   * Clears every factor for a user. The admin path for someone who has lost
   * both their phone and their recovery codes; their next login re-enrols if
   * the application requires a factor.
   */
  async reset(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.totpCredential.deleteMany({ where: { userId } }),
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.mfaChallenge.deleteMany({
        where: { userId, consumedAt: null },
      }),
    ]);

    this.logger.warn(`Second factors reset for user ${userId}`);
  }

  /** Housekeeping for challenges whose login was abandoned. */
  async pruneExpired(): Promise<number> {
    const { count } = await this.prisma.mfaChallenge.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    return count;
  }

  // --------------------------------------------------------------- internals

  /**
   * Checks a code against everything the user holds: each confirmed app first,
   * then the recovery codes. TOTP is tried first because it is the common case
   * and cannot be confused with a recovery code that happens to be all digits.
   */
  private async verifyUserCode(
    userId: string,
    code: string,
  ): Promise<VerifiedFactor | null> {
    const credentials = await this.prisma.totpCredential.findMany({
      where: { userId, confirmedAt: { not: null } },
    });

    for (const credential of credentials) {
      const step = this.matchCredential(credential, code);

      if (step !== null && (await this.claimStep(credential, step))) {
        return 'totp';
      }
    }

    return (await this.claimRecoveryCode(userId, code))
      ? 'recovery_code'
      : null;
  }

  private matchCredential(
    credential: TotpCredential,
    code: string,
  ): number | null {
    return verifyTotp({
      secret: this.crypto.open(credential.secretEnc),
      code,
      parameters: this.parametersOf(credential),
    });
  }

  /**
   * Records the step a code came from, refusing anything at or below the last
   * one accepted. Codes stay valid for a minute and a half of wall clock, and
   * without this a shoulder-surfed code would be usable for most of it.
   */
  private async claimStep(
    credential: TotpCredential,
    step: number,
  ): Promise<boolean> {
    const { count } = await this.prisma.totpCredential.updateMany({
      where: {
        id: credential.id,
        OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: BigInt(step) } }],
      },
      data: { lastUsedStep: BigInt(step), lastUsedAt: new Date() },
    });

    if (count !== 1) {
      this.logger.warn(
        `Replayed TOTP code for credential ${credential.id} refused`,
      );
    }

    return count === 1;
  }

  private async confirmCredential(
    credential: TotpCredential,
    step: number,
  ): Promise<void> {
    await this.prisma.totpCredential.update({
      where: { id: credential.id },
      data: {
        confirmedAt: new Date(),
        // The confirming code is spent, so it cannot immediately be replayed
        // as a login.
        lastUsedStep: BigInt(step),
        lastUsedAt: new Date(),
      },
    });
  }

  /**
   * Recovery codes are hashed with argon2id rather than looked up by digest.
   * They are shorter than a secret and typed by hand, so a stolen table should
   * not be a set of offline-crackable bypasses; at ten unused codes per user
   * the cost of walking them is paid only on the rare recovery path.
   */
  private async claimRecoveryCode(
    userId: string,
    code: string,
  ): Promise<boolean> {
    const normalized = normalizeRecoveryCode(code);

    if (normalized.length === 0) {
      return false;
    }

    const stored = await this.prisma.mfaRecoveryCode.findMany({
      where: { userId, usedAt: null },
    });

    for (const candidate of stored) {
      if (!(await this.verifyHash(candidate.codeHash, normalized))) {
        continue;
      }

      const { count } = await this.prisma.mfaRecoveryCode.updateMany({
        where: { id: candidate.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      if (count === 1) {
        this.logger.warn(`Recovery code spent for user ${userId}`);
        return true;
      }
    }

    return false;
  }

  private async verifyHash(hash: string, value: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, value);
    } catch {
      return false;
    }
  }

  private async replaceRecoveryCodes(userId: string): Promise<string[]> {
    const codes = generateRecoveryCodes();
    const hashes = await Promise.all(
      codes.map((code) =>
        argon2.hash(normalizeRecoveryCode(code), { type: argon2.argon2id }),
      ),
    );

    await this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.mfaRecoveryCode.createMany({
        data: hashes.map((codeHash) => ({ userId, codeHash })),
      }),
    ]);

    return codes;
  }

  /** Guards a change to someone's factors with a current code. */
  private async requireCode(userId: string, code?: string): Promise<void> {
    if (!code || !(await this.verifyUserCode(userId, code))) {
      throw new InvalidMfaCodeError(
        'A current code from your authenticator app is required',
      );
    }
  }

  private async createPendingCredential(
    userId: string,
    label: string,
  ): Promise<TotpCredential> {
    // An unconfirmed row is a QR code nobody finished scanning; replacing it
    // keeps the (userId, label) pair free and leaves no dead secrets behind.
    await this.prisma.totpCredential.deleteMany({
      where: { userId, label, confirmedAt: null },
    });

    return this.prisma.totpCredential.create({
      data: {
        userId,
        label,
        secretEnc: this.crypto.seal(generateTotpSecret()),
        algorithm: TOTP_DEFAULTS.algorithm,
        digits: TOTP_DEFAULTS.digits,
        period: TOTP_DEFAULTS.period,
      },
    });
  }

  private describeEnrollment(
    credential: TotpCredential,
    issuer: string,
    accountName: string,
  ): TotpEnrollment {
    const secret = this.crypto.open(credential.secretEnc);
    const parameters = this.parametersOf(credential);

    return {
      credentialId: credential.id,
      label: credential.label,
      secret,
      otpauthUri: buildOtpAuthUri({
        issuer,
        accountName,
        secret,
        parameters,
      }),
      ...parameters,
    };
  }

  private parametersOf(credential: TotpCredential): TotpParameters {
    return {
      algorithm: credential.algorithm as TotpAlgorithm,
      digits: credential.digits,
      period: credential.period,
    };
  }

  private assertEnrolmentAllowed(application: Application): void {
    if (application.mfaPolicy === MfaPolicy.DISABLED) {
      throw new MfaNotAvailableError(
        `Application ${application.slug} does not use second factors`,
      );
    }
  }

  private countConfirmed(userId: string): Promise<number> {
    return this.prisma.totpCredential.count({
      where: { userId, confirmedAt: { not: null } },
    });
  }

  private async loadOpenChallenge(token: string): Promise<MfaChallenge> {
    if (!token) {
      throw new InvalidMfaChallengeError('The challenge token is missing');
    }

    const challenge = await this.prisma.mfaChallenge.findUnique({
      where: { tokenHash: SecretCryptoService.sha256(token) },
    });

    if (!challenge) {
      throw new InvalidMfaChallengeError('Unknown challenge');
    }

    if (challenge.consumedAt !== null) {
      throw new InvalidMfaChallengeError(
        'This challenge has already been used',
      );
    }

    if (challenge.expiresAt.getTime() < Date.now()) {
      throw new InvalidMfaChallengeError('This challenge has expired');
    }

    if (challenge.attempts >= MAX_ATTEMPTS) {
      throw new MfaAttemptsExhaustedError(
        'Too many incorrect codes; start the sign-in again',
      );
    }

    return challenge;
  }

  private discardChallenge(id: string): Promise<Prisma.BatchPayload> {
    return this.prisma.mfaChallenge.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }
}
