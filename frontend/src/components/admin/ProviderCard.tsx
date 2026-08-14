"use client";

import {
  Button,
  Column,
  Feedback,
  PasswordInput,
  Row,
  Switch,
  Tag,
  Text,
} from "@once-ui-system/core";
import { useState } from "react";
import { adminApi } from "@/lib/admin-api";
import type { Provider } from "@/lib/api-types";
import { CopyableField } from "./CopyableField";

interface ProviderCardProps {
  provider: Provider;
  onChanged: () => void;
}

export function ProviderCard({ provider, onChanged }: ProviderCardProps) {
  const [rotating, setRotating] = useState(false);
  const [newSecret, setNewSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Column
      fillWidth
      gap="16"
      padding="20"
      radius="l"
      border="neutral-alpha-weak"
    >
      <Row fillWidth horizontal="between" vertical="center">
        <Column gap="4">
          <Row gap="8" vertical="center">
            <Text variant="label-strong-s">{provider.displayName}</Text>
            <Tag size="s">{provider.kind}</Tag>
            {!provider.isEnabled && (
              <Tag size="s" variant="danger">
                disabled
              </Tag>
            )}
          </Row>
          <Text variant="code-default-xs" onBackground="neutral-weak">
            {provider.slug}
          </Text>
        </Column>

        <Switch
          id={`provider-enabled-${provider.id}`}
          ariaLabel="Enabled"
          isChecked={provider.isEnabled}
          disabled={busy}
          onToggle={() =>
            void run(() =>
              adminApi.updateProvider(provider.id, {
                isEnabled: !provider.isEnabled,
              }),
            )
          }
        />
      </Row>

      {error && <Feedback variant="danger" description={error} />}

      <CopyableField
        label="Callback URL"
        value={provider.callbackUrl}
        description="Register this exact URL with the provider, or logins will fail with redirect_uri_mismatch."
      />

      <Row fillWidth gap="24" wrap>
        <Column gap="4">
          <Text variant="label-default-s" onBackground="neutral-weak">
            Client ID
          </Text>
          <Text variant="code-default-xs">{provider.clientId}</Text>
        </Column>
        <Column gap="4">
          <Text variant="label-default-s" onBackground="neutral-weak">
            Client secret
          </Text>
          <Text variant="code-default-xs">••••{provider.clientSecretLast4}</Text>
        </Column>
        <Column gap="4">
          <Text variant="label-default-s" onBackground="neutral-weak">
            PKCE
          </Text>
          <Text variant="code-default-xs">
            {provider.usePkce ? "enabled" : "disabled"}
          </Text>
        </Column>
      </Row>

      {rotating ? (
        <Column fillWidth gap="12">
          <PasswordInput
            id={`rotate-${provider.id}`}
            label="New client secret"
            value={newSecret}
            onChange={(event) => setNewSecret(event.target.value)}
          />
          <Row gap="8">
            <Button
              size="s"
              disabled={busy || newSecret.length === 0}
              onClick={() =>
                void run(async () => {
                  await adminApi.rotateProviderSecret(provider.id, newSecret);
                  setNewSecret("");
                  setRotating(false);
                })
              }
            >
              Replace secret
            </Button>
            <Button
              size="s"
              variant="tertiary"
              onClick={() => {
                setRotating(false);
                setNewSecret("");
              }}
            >
              Cancel
            </Button>
          </Row>
        </Column>
      ) : (
        <Row gap="8">
          <Button size="s" variant="secondary" onClick={() => setRotating(true)}>
            Replace secret
          </Button>
          <Button
            size="s"
            variant="danger"
            disabled={busy}
            onClick={() => void run(() => adminApi.removeProvider(provider.id))}
          >
            Remove
          </Button>
        </Row>
      )}
    </Column>
  );
}
