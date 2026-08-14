import { ProviderKind } from '@prisma/client';
import { asBoolean, asRecord, asString, NormalizedProfile } from '../profile';
import { ProviderPreset } from './preset.types';

/**
 * Discord serves avatars from a CDN path built from the user id and avatar
 * hash, with an animated variant when the hash carries the `a_` prefix. Users
 * without an avatar fall back to a shard of the default set.
 */
function buildAvatarUrl(
  userId: string,
  avatarHash: string | null,
  discriminator: string | null,
): string | null {
  if (avatarHash) {
    const extension = avatarHash.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${extension}`;
  }

  if (!userId) {
    return null;
  }

  // Legacy accounts shard by discriminator; migrated accounts shard by id.
  const index =
    discriminator && discriminator !== '0'
      ? Number(discriminator) % 5
      : Number((BigInt(userId) >> 22n) % 6n);

  return Number.isFinite(index)
    ? `https://cdn.discordapp.com/embed/avatars/${index}.png`
    : null;
}

export const discordPreset: ProviderPreset = {
  kind: ProviderKind.DISCORD,
  displayName: 'Discord',
  iconName: 'discord',
  authorizationUrl: 'https://discord.com/oauth2/authorize',
  tokenUrl: 'https://discord.com/api/oauth2/token',
  userinfoUrl: 'https://discord.com/api/users/@me',
  defaultScopes: ['identify', 'email'],
  usePkce: true,

  mapProfile(raw: unknown): NormalizedProfile {
    const profile = asRecord(raw) ?? {};
    const id = asString(profile.id) ?? '';

    return {
      providerAccountId: id,
      email: asString(profile.email),
      // The old implementation ignored this flag and treated every Discord
      // address as trustworthy.
      emailVerified: asBoolean(profile.verified),
      username: asString(profile.global_name) ?? asString(profile.username),
      avatarUrl: buildAvatarUrl(
        id,
        asString(profile.avatar),
        asString(profile.discriminator),
      ),
      raw,
    };
  },
};
