import { ProviderKind } from '@prisma/client';
import { asBoolean, asRecord, asString, NormalizedProfile } from '../profile';
import { PresetContext, ProviderPreset } from './preset.types';

interface GithubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

function pickPrimaryEmail(payload: unknown): GithubEmail | null {
  if (!Array.isArray(payload)) {
    return null;
  }

  const entries = payload
    .map((item) => {
      const record = asRecord(item);
      const email = asString(record?.email);
      return record && email
        ? {
            email,
            primary: asBoolean(record.primary),
            verified: asBoolean(record.verified),
          }
        : null;
    })
    .filter((item): item is GithubEmail => item !== null);

  return (
    entries.find((item) => item.primary && item.verified) ??
    entries.find((item) => item.verified) ??
    entries[0] ??
    null
  );
}

export const githubPreset: ProviderPreset = {
  kind: ProviderKind.GITHUB,
  displayName: 'GitHub',
  iconName: 'github',
  authorizationUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  userinfoUrl: 'https://api.github.com/user',
  defaultScopes: ['read:user', 'user:email'],
  // GitHub OAuth Apps reject `code_challenge`, hence the per-provider flag.
  usePkce: false,
  userinfoHeaders: {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  },

  async mapProfile(
    raw: unknown,
    ctx: PresetContext,
  ): Promise<NormalizedProfile> {
    const profile = asRecord(raw) ?? {};

    let email = asString(profile.email);
    let emailVerified = false;

    // /user omits the address when the user keeps it private, so fall back to
    // the dedicated endpoint the `user:email` scope grants.
    if (!email) {
      const emails = await ctx.fetchJson('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${ctx.accessToken}`,
          Accept: 'application/vnd.github+json',
        },
      });
      const primary = pickPrimaryEmail(emails);
      email = primary?.email ?? null;
      emailVerified = primary?.verified ?? false;
    } else {
      // An address returned inline is the account's verified primary one.
      emailVerified = true;
    }

    return {
      providerAccountId: asString(profile.id) ?? '',
      email,
      emailVerified,
      username: asString(profile.name) ?? asString(profile.login),
      avatarUrl: asString(profile.avatar_url),
      raw,
    };
  },
};
