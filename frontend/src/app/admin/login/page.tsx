"use client";

import {
  Button,
  Column,
  Feedback,
  Heading,
  Input,
  PasswordInput,
  Text,
} from "@once-ui-system/core";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { adminApi } from "@/lib/admin-api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await adminApi.login(email, password);
      // The session cookie is httpOnly, so the server layout re-reads it.
      router.replace("/admin");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed");
      setBusy(false);
    }
  };

  return (
    <Column fillWidth center padding="l" style={{ minHeight: "100vh" }}>
      <Column
        as="form"
        onSubmit={submit}
        gap="16"
        padding="32"
        maxWidth={24}
        fillWidth
        radius="xl"
        background="page"
        border="neutral-alpha-weak"
      >
        <Column gap="4">
          <Heading variant="heading-strong-m">Admin sign in</Heading>
          <Text variant="body-default-s" onBackground="neutral-weak">
            Manage applications and their login providers.
          </Text>
        </Column>

        {error && <Feedback variant="danger" description={error} />}

        <Input
          id="admin-email"
          label="Email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <PasswordInput
          id="admin-password"
          label="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <Button type="submit" fillWidth loading={busy} disabled={busy}>
          Sign in
        </Button>
      </Column>
    </Column>
  );
}
