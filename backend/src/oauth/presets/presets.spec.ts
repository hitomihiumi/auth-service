import { ProviderKind } from '@prisma/client';
import { NormalizedProfile } from '../profile';
import { discordPreset } from './discord.preset';
import { githubPreset } from './github.preset';
import { googlePreset } from './google.preset';
import { findPreset, listPresets } from './index';
import { PresetContext } from './preset.types';

const context = (
  fetchJson: PresetContext['fetchJson'] = jest.fn(),
): PresetContext => ({
  accessToken: 'token',
  fetchJson,
});

const resolve = (result: NormalizedProfile | Promise<NormalizedProfile>) =>
  Promise.resolve(result);

describe('googlePreset', () => {
  it('maps a standard OIDC userinfo payload', async () => {
    const profile = await resolve(
      googlePreset.mapProfile(
        {
          sub: '110123456789',
          email: 'ada@example.com',
          email_verified: true,
          name: 'Ada Lovelace',
          picture: 'https://lh3.googleusercontent.com/a/x',
        },
        context(),
      ),
    );

    expect(profile).toMatchObject({
      providerAccountId: '110123456789',
      email: 'ada@example.com',
      emailVerified: true,
      username: 'Ada Lovelace',
      avatarUrl: 'https://lh3.googleusercontent.com/a/x',
    });
  });

  it('falls back to the given name and treats an unverified email as such', async () => {
    const profile = await resolve(
      googlePreset.mapProfile(
        { sub: '1', given_name: 'Ada', email: 'ada@example.com' },
        context(),
      ),
    );

    expect(profile.username).toBe('Ada');
    expect(profile.emailVerified).toBe(false);
  });
});

describe('discordPreset', () => {
  it('builds the CDN avatar URL', async () => {
    const profile = await resolve(
      discordPreset.mapProfile(
        {
          id: '80351110224678912',
          username: 'ada',
          global_name: 'Ada',
          email: 'ada@example.com',
          verified: true,
          avatar: '8342729096ea3675442027381ff50dfe',
        },
        context(),
      ),
    );

    expect(profile.avatarUrl).toBe(
      'https://cdn.discordapp.com/avatars/80351110224678912/8342729096ea3675442027381ff50dfe.png',
    );
    expect(profile.username).toBe('Ada');
    expect(profile.emailVerified).toBe(true);
  });

  it('uses the gif extension for an animated avatar', async () => {
    const profile = await resolve(
      discordPreset.mapProfile(
        { id: '1', avatar: 'a_1234567890abcdef' },
        context(),
      ),
    );

    expect(profile.avatarUrl).toBe(
      'https://cdn.discordapp.com/avatars/1/a_1234567890abcdef.gif',
    );
  });

  it('falls back to a default avatar when none is set', async () => {
    const profile = await resolve(
      discordPreset.mapProfile(
        { id: '80351110224678912', avatar: null },
        context(),
      ),
    );

    expect(profile.avatarUrl).toMatch(
      /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/,
    );
  });

  // The previous implementation ignored `verified` entirely.
  it('does not trust an unverified address', async () => {
    const profile = await resolve(
      discordPreset.mapProfile(
        { id: '1', email: 'ada@example.com', verified: false },
        context(),
      ),
    );

    expect(profile.emailVerified).toBe(false);
  });
});

describe('githubPreset', () => {
  it('does not use PKCE, which GitHub OAuth Apps reject', () => {
    expect(githubPreset.usePkce).toBe(false);
  });

  it('maps an inline email as verified', async () => {
    const fetchJson = jest.fn();
    const profile = await resolve(
      githubPreset.mapProfile(
        {
          id: 583231,
          login: 'octocat',
          name: 'The Octocat',
          email: 'octocat@github.com',
          avatar_url: 'https://avatars.githubusercontent.com/u/583231',
        },
        context(fetchJson),
      ),
    );

    expect(profile.providerAccountId).toBe('583231');
    expect(profile.email).toBe('octocat@github.com');
    expect(profile.emailVerified).toBe(true);
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('falls back to the emails endpoint when the address is hidden', async () => {
    const fetchJson: jest.MockedFunction<PresetContext['fetchJson']> = jest
      .fn()
      .mockResolvedValue([
        { email: 'secondary@github.com', primary: false, verified: true },
        { email: 'octocat@github.com', primary: true, verified: true },
      ]);

    const profile = await resolve(
      githubPreset.mapProfile(
        { id: 1, login: 'octocat', email: null },
        context(fetchJson),
      ),
    );

    const [url, init] = fetchJson.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/user/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer token',
    );
    expect(profile.email).toBe('octocat@github.com');
    expect(profile.emailVerified).toBe(true);
  });

  it('reports no email when the account exposes none', async () => {
    const profile = await resolve(
      githubPreset.mapProfile(
        { id: 1, login: 'octocat', email: null },
        context(jest.fn().mockResolvedValue([])),
      ),
    );

    expect(profile.email).toBeNull();
    expect(profile.emailVerified).toBe(false);
  });
});

describe('preset catalog', () => {
  it.each([ProviderKind.GOOGLE, ProviderKind.DISCORD, ProviderKind.GITHUB])(
    'has a preset for %s',
    (kind) => {
      expect(findPreset(kind)).not.toBeNull();
    },
  );

  it.each([ProviderKind.OIDC, ProviderKind.OAUTH2])(
    'has no preset for generic kind %s',
    (kind) => {
      expect(findPreset(kind)).toBeNull();
    },
  );

  it('lists every kind for the admin form, flagging which need endpoints', () => {
    const listed = listPresets();

    expect(listed.map((entry) => entry.kind).sort()).toEqual(
      Object.values(ProviderKind).sort(),
    );
    expect(
      listed
        .filter((entry) => entry.requiresEndpoints)
        .map((entry) => entry.kind)
        .sort(),
    ).toEqual([ProviderKind.OAUTH2, ProviderKind.OIDC].sort());
  });
});
