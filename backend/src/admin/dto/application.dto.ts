import { PartialType, OmitType } from '@nestjs/swagger';
import { MfaPolicy } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateApplicationDto {
  /**
   * Appears in the public login URL, so it is restricted to URL-safe characters
   * and cannot be changed later without breaking every integration.
   */
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message:
      'slug must be lowercase alphanumeric, optionally hyphenated, and cannot start or end with a hyphen',
  })
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86_400)
  tokenTtlSeconds?: number;

  @IsOptional()
  @IsBoolean()
  allowEmailLinking?: boolean;

  /**
   * Whether logins ask for a code from an authenticator app. `OPTIONAL`
   * challenges only the users who enrolled; `REQUIRED` enrols the rest on
   * their next sign-in; `DISABLED` turns the prompt off for everyone.
   */
  @IsOptional()
  @IsEnum(MfaPolicy)
  mfaPolicy?: MfaPolicy;
}

/**
 * The slug is deliberately absent: it is baked into login URLs and the
 * callback registered with each upstream provider.
 */
export class UpdateApplicationDto extends PartialType(
  OmitType(CreateApplicationDto, ['slug'] as const),
) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateRedirectUriDto {
  @IsString()
  @MaxLength(2048)
  uri!: string;
}

export class ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
