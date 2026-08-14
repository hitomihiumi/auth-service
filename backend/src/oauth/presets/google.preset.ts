import { ProviderKind } from '@prisma/client';
import { asBoolean, asRecord, asString, NormalizedProfile } from '../profile';
import { ProviderPreset } from './preset.types';

export const googlePreset: ProviderPreset = {
  kind: ProviderKind.GOOGLE,
  displayName: 'Google',
  iconName: 'google',
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  userinfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
  defaultScopes: ['openid', 'profile', 'email'],
  usePkce: true,

  mapProfile(raw: unknown): NormalizedProfile {
    const profile = asRecord(raw) ?? {};

    return {
      providerAccountId: asString(profile.sub) ?? '',
      email: asString(profile.email),
      emailVerified: asBoolean(profile.email_verified),
      username: asString(profile.name) ?? asString(profile.given_name),
      avatarUrl: asString(profile.picture),
      raw,
    };
  },
};
