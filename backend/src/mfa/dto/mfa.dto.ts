import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * A TOTP code is six digits and a recovery code is ten characters with a
 * hyphen, and both arrive in this one field: the user simply types whichever
 * they have. The service tries them in that order.
 */
export class MfaCodeDto {
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code!: string;
}

export class StartEnrollmentDto {
  /** Device name, so a user with several apps can tell them apart later. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string;
}

export class ChallengeQueryDto {
  @IsString()
  @MaxLength(256)
  token!: string;
}

export class VerifyChallengeDto extends MfaCodeDto {
  @IsString()
  @MaxLength(256)
  token!: string;
}
