"use client";

import {
  Button,
  Column,
  Feedback,
  Input,
  PasswordInput,
  Row,
  Select,
  Text,
} from "@once-ui-system/core";
import { type FormEvent, useMemo, useState } from "react";
import { adminApi, type CreateProviderInput } from "@/lib/admin-api";
import type { ProviderKind, ProviderKindInfo } from "@/lib/api-types";

interface ProviderFormProps {
  applicationId: string;
  kinds: ProviderKindInfo[];
  onCreated: () => void;
}

export function ProviderForm({
  applicationId,
  kinds,
  onCreated,
}: ProviderFormProps) {
  const [kind, setKind] = useState<ProviderKind | "">("");
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scopes, setScopes] = useState("");
  const [authorizationUrl, setAuthorizationUrl] = useState("");
  const [tokenUrl, setTokenUrl] = useState("");
  const [userinfoUrl, setUserinfoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => kinds.find((entry) => entry.kind === kind) ?? null,
    [kinds, kind],
  );

  const chooseKind = (value: string) => {
    const next = kinds.find((entry) => entry.kind === value);
    setKind(value as ProviderKind);

    // Prefill from the preset so the common case is just id + secret.
    if (next) {
      setSlug(next.kind.toLowerCase());
      setDisplayName(`Continue with ${next.displayName}`);
      setScopes(next.defaultScopes.join(" "));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!kind) return;

    setBusy(true);
    setError(null);

    const input: CreateProviderInput = {
      kind,
      slug,
      displayName,
      clientId,
      clientSecret,
      scopes: scopes.split(/\s+/).filter(Boolean),
    };

    if (selected?.requiresEndpoints) {
      input.authorizationUrl = authorizationUrl;
      input.tokenUrl = tokenUrl;
      input.userinfoUrl = userinfoUrl;
    }

    try {
      await adminApi.createProvider(applicationId, input);
      setKind("");
      setSlug("");
      setDisplayName("");
      setClientId("");
      setClientSecret("");
      setScopes("");
      setAuthorizationUrl("");
      setTokenUrl("");
      setUserinfoUrl("");
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add provider");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Column
      as="form"
      onSubmit={submit}
      fillWidth
      gap="16"
      padding="24"
      radius="l"
      border="neutral-alpha-weak"
    >
      <Text variant="label-strong-s">Add a login provider</Text>

      {error && <Feedback variant="danger" description={error} />}

      <Select
        id="provider-kind"
        label="Provider"
        value={kind}
        options={kinds.map((entry) => ({
          value: entry.kind,
          label: entry.displayName,
        }))}
        onSelect={(value: string) => chooseKind(value)}
      />

      {selected && (
        <>
          <Row fillWidth gap="16" s={{ direction: "column" }}>
            <Input
              id="provider-slug"
              label="Slug"
              required
              value={slug}
              description="Used in the login URL."
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
            />
            <Input
              id="provider-label"
              label="Button label"
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Row>

          <Input
            id="provider-client-id"
            label="Client ID"
            required
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
          />

          <PasswordInput
            id="provider-client-secret"
            label="Client secret"
            required
            value={clientSecret}
            description="Stored encrypted and never shown again."
            onChange={(event) => setClientSecret(event.target.value)}
          />

          <Input
            id="provider-scopes"
            label="Scopes"
            value={scopes}
            description="Space separated."
            onChange={(event) => setScopes(event.target.value)}
          />

          {selected.requiresEndpoints && (
            <Column fillWidth gap="16">
              <Text variant="body-default-xs" onBackground="neutral-weak">
                This provider has no preset, so its endpoints are required.
              </Text>
              <Input
                id="provider-authorization-url"
                label="Authorization URL"
                required
                value={authorizationUrl}
                onChange={(event) => setAuthorizationUrl(event.target.value)}
              />
              <Input
                id="provider-token-url"
                label="Token URL"
                required
                value={tokenUrl}
                onChange={(event) => setTokenUrl(event.target.value)}
              />
              <Input
                id="provider-userinfo-url"
                label="Userinfo URL"
                required
                value={userinfoUrl}
                onChange={(event) => setUserinfoUrl(event.target.value)}
              />
            </Column>
          )}

          {!selected.usePkce && (
            <Feedback
              variant="warning"
              description="This provider does not support PKCE, so it will be omitted from the authorization request."
            />
          )}

          <Row>
            <Button type="submit" loading={busy} disabled={busy}>
              Add provider
            </Button>
          </Row>
        </>
      )}
    </Column>
  );
}
