import { PartialType, OmitType } from '@nestjs/swagger';
import { ProviderKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsEndpointUrl } from '../../common/validators/is-endpoint-url.validator';

/** Endpoints must be supplied by hand only for the generic kinds. */
const isGeneric = (dto: { kind?: ProviderKind }): boolean =>
  dto.kind === ProviderKind.OIDC || dto.kind === ProviderKind.OAUTH2;

export class CreateProviderDto {
  @IsEnum(ProviderKind)
  kind!: ProviderKind;

  /** Part of the login URL for this provider. */
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message: 'slug must be lowercase alphanumeric, optionally hyphenated',
  })
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  iconName?: string;

  @IsString()
  @MaxLength(500)
  clientId!: string;

  /** Write-only: never present on any response. */
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  clientSecret!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  scopes?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  usePkce?: boolean;

  @ValidateIf(isGeneric)
  @IsEndpointUrl()
  @MaxLength(2048)
  authorizationUrl?: string;

  @ValidateIf(isGeneric)
  @IsEndpointUrl()
  @MaxLength(2048)
  tokenUrl?: string;

  @ValidateIf(isGeneric)
  @IsEndpointUrl()
  @MaxLength(2048)
  userinfoUrl?: string;

  @IsOptional()
  @IsEndpointUrl()
  @MaxLength(2048)
  issuer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  claimSub?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  claimEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  claimUsername?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  claimAvatar?: string;
}

/**
 * The secret is replaced through its own endpoint, so that omitting it here
 * unambiguously means "leave it as it is".
 */
export class UpdateProviderDto extends PartialType(
  OmitType(CreateProviderDto, ['kind', 'slug', 'clientSecret'] as const),
) {}

export class RotateSecretDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  clientSecret!: string;
}
