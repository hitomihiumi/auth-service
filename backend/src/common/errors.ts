/**
 * Domain errors that a controller translates into either an HTTP status or a
 * redirect carrying an `error` code. Keeping them separate from HttpException
 * lets the login flow decide between the two — an OAuth failure mid-flow should
 * bounce the browser back to the consumer app, not render a JSON body.
 */
export abstract class AuthFlowError extends Error {
  /** Stable machine-readable code, surfaced to consumers as `?error=`. */
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidRedirectUriError extends AuthFlowError {
  readonly code = 'invalid_redirect_uri';
}

export class UnknownApplicationError extends AuthFlowError {
  readonly code = 'unknown_application';
}

export class UnknownProviderError extends AuthFlowError {
  readonly code = 'unknown_provider';
}

export class InvalidAuthTransactionError extends AuthFlowError {
  readonly code = 'invalid_state';
}

export class ProviderExchangeError extends AuthFlowError {
  readonly code = 'provider_error';
}

export class EmailAlreadyRegisteredError extends AuthFlowError {
  readonly code = 'email_already_registered';
}

export class UserBlockedError extends AuthFlowError {
  readonly code = 'user_blocked';
}

export class UnknownUserError extends AuthFlowError {
  readonly code = 'unknown_user';
}

/** The login is sound but a second factor is still owed. */
export class MfaRequiredError extends AuthFlowError {
  readonly code = 'mfa_required';
}

export class InvalidMfaChallengeError extends AuthFlowError {
  readonly code = 'invalid_mfa_challenge';
}

export class InvalidMfaCodeError extends AuthFlowError {
  readonly code = 'invalid_mfa_code';
}

/** The challenge ran out of guesses and has to be restarted from the sign-in page. */
export class MfaAttemptsExhaustedError extends AuthFlowError {
  readonly code = 'mfa_attempts_exhausted';
}

/** Enrolment was attempted on an application whose policy forbids it. */
export class MfaNotAvailableError extends AuthFlowError {
  readonly code = 'mfa_not_available';
}
