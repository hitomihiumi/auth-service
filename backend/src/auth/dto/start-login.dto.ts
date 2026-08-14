import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StartLoginQueryDto {
  /**
   * Where to send the browser once the login completes. Must already be
   * registered for the application; validated before the provider is contacted.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  redirect_uri?: string;

  /**
   * Opaque value echoed back to the consumer untouched. The OAuth `state`
   * parameter now belongs to this service, so this is where a consumer's own
   * CSRF token goes.
   */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  state?: string;
}

export class CallbackQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  error?: string;
}

export class VerifyTokenDto {
  @IsString()
  @MaxLength(8192)
  token!: string;

  /** Application slug or client id; selects the key set to verify against. */
  @IsString()
  @MaxLength(256)
  application!: string;
}
