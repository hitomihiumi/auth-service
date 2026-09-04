"use client";

import {
  Button,
  Column,
  Feedback,
  Heading,
  Input,
  Row,
  Select,
  Spinner,
  Table,
  Tag,
  Text,
} from "@once-ui-system/core";
import { use, useCallback, useEffect, useState } from "react";
import { CopyableField } from "@/components/admin/CopyableField";
import { ProviderCard } from "@/components/admin/ProviderCard";
import { ProviderForm } from "@/components/admin/ProviderForm";
import { adminApi } from "@/lib/admin-api";
import type {
  ApplicationDetail,
  AppUser,
  MfaPolicy,
  ProviderKindInfo,
} from "@/lib/api-types";

/** The three settings, with what each one does to a sign-in. */
const MFA_POLICIES: Array<{ value: MfaPolicy; label: string; hint: string }> = [
  {
    value: "DISABLED",
    label: "Disabled",
    hint: "Nobody is asked for a code, even users who enrolled one.",
  },
  {
    value: "OPTIONAL",
    label: "Optional",
    hint: "Users may enrol an authenticator app; only those who did are asked.",
  },
  {
    value: "REQUIRED",
    label: "Required",
    hint: "Everyone is asked; users without an app enrol on their next sign-in.",
  },
];

export default function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [kinds, setKinds] = useState<ProviderKindInfo[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newUri, setNewUri] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [detail, kindList, userPage] = await Promise.all([
        adminApi.getApplication(id),
        adminApi.providerKinds(),
        adminApi.listUsers(id),
      ]);
      setApplication(detail);
      setKinds(kindList);
      setUsers(userPage.items);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  if (!application) {
    return (
      <Column fillWidth center padding="32" gap="16">
        {error ? <Feedback variant="danger" description={error} /> : <Spinner />}
      </Column>
    );
  }

  const loginUrl = application.loginUrlTemplate
    .replace("{providerSlug}", application.providers[0]?.slug ?? "google")
    .replace(
      "{redirectUri}",
      encodeURIComponent(application.redirectUris[0]?.uri ?? ""),
    );

  return (
    <Column fillWidth gap="32">
      <Column gap="8">
        <Row gap="12" vertical="center">
          <Heading variant="heading-strong-m">{application.name}</Heading>
          <Tag size="s">{application.slug}</Tag>
          {!application.isActive && (
            <Tag size="s" variant="danger">
              disabled
            </Tag>
          )}
        </Row>
        <Text variant="body-default-s" onBackground="neutral-weak">
          {application._count.users} user(s) · token TTL{" "}
          {application.tokenTtlSeconds}s · account linking{" "}
          {application.allowEmailLinking ? "on" : "off"} · two-factor{" "}
          {application.mfaPolicy.toLowerCase()}
        </Text>
      </Column>

      {error && <Feedback variant="danger" description={error} />}

      <Column fillWidth gap="16" padding="24" radius="l" border="neutral-alpha-weak">
        <Text variant="label-strong-s">Integration</Text>
        <CopyableField
          label="Client ID (JWT audience)"
          value={application.clientId}
        />
        <CopyableField
          label="JWKS URL"
          value={application.jwksUrl}
          description="Consumers verify tokens against these keys without a shared secret."
        />
        <CopyableField label="Example login URL" value={loginUrl} />
      </Column>

      <Column
        fillWidth
        gap="12"
        padding="24"
        radius="l"
        border="neutral-alpha-weak"
      >
        <Text variant="label-strong-s">Two-factor authentication</Text>
        <Select
          id="mfa-policy"
          label="Authenticator app codes"
          value={application.mfaPolicy}
          options={MFA_POLICIES.map((entry) => ({
            value: entry.value,
            label: entry.label,
          }))}
          onSelect={(value: string) =>
            void run(() =>
              adminApi.updateApplication(application.id, {
                mfaPolicy: value as MfaPolicy,
              }),
            )
          }
        />
        <Text variant="body-default-xs" onBackground="neutral-weak">
          {
            MFA_POLICIES.find((entry) => entry.value === application.mfaPolicy)
              ?.hint
          }
        </Text>
      </Column>

      <Column fillWidth gap="16">
        <Heading variant="heading-strong-s">Redirect URIs</Heading>
        <Text variant="body-default-xs" onBackground="neutral-weak">
          A login may only return to one of these. Anything else is rejected
          before the provider is contacted.
        </Text>

        {application.redirectUris.length === 0 ? (
          <Feedback
            variant="warning"
            description="No redirect URIs registered — logins cannot complete until one is added."
          />
        ) : (
          <Column fillWidth gap="8">
            {application.redirectUris.map((entry) => (
              <Row
                key={entry.id}
                fillWidth
                horizontal="between"
                vertical="center"
                padding="12"
                radius="m"
                border="neutral-alpha-weak"
              >
                <Text variant="code-default-s">{entry.uri}</Text>
                <Button
                  size="s"
                  variant="tertiary"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      adminApi.removeRedirectUri(application.id, entry.id),
                    )
                  }
                >
                  Remove
                </Button>
              </Row>
            ))}
          </Column>
        )}

        <Row fillWidth gap="8" vertical="end" s={{ direction: "column" }}>
          <Input
            id="new-redirect-uri"
            label="Add a redirect URI"
            value={newUri}
            onChange={(event) => setNewUri(event.target.value)}
          />
          <Button
            disabled={busy || newUri.length === 0}
            onClick={() =>
              void run(async () => {
                await adminApi.addRedirectUri(application.id, newUri);
                setNewUri("");
              })
            }
          >
            Add
          </Button>
        </Row>
      </Column>

      <Column fillWidth gap="16">
        <Heading variant="heading-strong-s">Login providers</Heading>

        {application.providers.length === 0 ? (
          <Feedback
            variant="info"
            description="No providers yet. Add one below — its credentials are stored here, not in the environment."
          />
        ) : (
          application.providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onChanged={() => void load()}
            />
          ))
        )}

        <ProviderForm
          applicationId={application.id}
          kinds={kinds}
          onCreated={() => void load()}
        />
      </Column>

      <Column fillWidth gap="16">
        <Heading variant="heading-strong-s">Signing keys</Heading>
        <Column fillWidth gap="8">
          {application.signingKeys.map((key) => (
            <Row
              key={key.id}
              fillWidth
              horizontal="between"
              vertical="center"
              padding="12"
              radius="m"
              border="neutral-alpha-weak"
            >
              <Row gap="8" vertical="center">
                <Text variant="code-default-s">{key.kid}</Text>
                <Tag size="s" variant={key.isActive ? "success" : "neutral"}>
                  {key.isActive ? "active" : "retired"}
                </Tag>
              </Row>
              <Text variant="body-default-xs" onBackground="neutral-weak">
                {key.algorithm}
              </Text>
            </Row>
          ))}
        </Column>
        <Row>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void run(() => adminApi.rotateSigningKey(application.id))}
          >
            Rotate signing key
          </Button>
        </Row>
        <Text variant="body-default-xs" onBackground="neutral-weak">
          The retired key stays published until the tokens it signed expire, so
          rotating does not sign anyone out.
        </Text>
      </Column>

      <Column fillWidth gap="16">
        <Heading variant="heading-strong-s">Users</Heading>
        {users.length === 0 ? (
          <Text variant="body-default-s" onBackground="neutral-weak">
            Nobody has signed in yet.
          </Text>
        ) : (
          <Table
            data={{
              headers: [
                { key: "user", content: "User" },
                { key: "providers", content: "Signed in with" },
                { key: "mfa", content: "Two-factor" },
                { key: "last", content: "Last login" },
                { key: "actions", content: "" },
              ],
              rows: users.map((user) => [
                <Column key={`${user.id}-id`} gap="2">
                  <Text variant="label-default-s">
                    {user.username ?? "(no name)"}
                  </Text>
                  <Text variant="body-default-xs" onBackground="neutral-weak">
                    {user.email ?? "(no email)"}
                  </Text>
                </Column>,
                <Text key={`${user.id}-p`} variant="body-default-xs">
                  {user.identities
                    .map((identity) => identity.applicationProvider.slug)
                    .join(", ")}
                </Text>,
                <Column key={`${user.id}-m`} gap="2">
                  <Tag
                    size="s"
                    variant={user.mfa.enabled ? "success" : "neutral"}
                  >
                    {user.mfa.enabled ? "enrolled" : "none"}
                  </Tag>
                  {user.mfa.enabled && (
                    <Text variant="body-default-xs" onBackground="neutral-weak">
                      {user.mfa.recoveryCodesRemaining} recovery code(s) left
                    </Text>
                  )}
                </Column>,
                <Text key={`${user.id}-l`} variant="body-default-xs">
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleString()
                    : "—"}
                </Text>,
                <Row key={`${user.id}-a`} gap="8">
                  {user.mfa.enabled && (
                    <Button
                      size="s"
                      variant="tertiary"
                      disabled={busy}
                      onClick={() =>
                        void run(() => adminApi.resetUserMfa(user.id))
                      }
                    >
                      Reset 2FA
                    </Button>
                  )}
                  <Button
                    size="s"
                    variant={user.isBlocked ? "secondary" : "tertiary"}
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        adminApi.setUserBlocked(user.id, !user.isBlocked),
                      )
                    }
                  >
                    {user.isBlocked ? "Unblock" : "Block"}
                  </Button>
                </Row>,
              ]),
            }}
          />
        )}
      </Column>
    </Column>
  );
}
