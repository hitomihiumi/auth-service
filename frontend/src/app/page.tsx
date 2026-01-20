"use client";

import {
    Heading,
    Text,
    Button,
    Column,
    Row,
    Line
} from "@once-ui-system/core";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

function LoginContent() {
  const searchParams = useSearchParams();
  const [callbackUrl, setCallbackUrl] = useState("/");

  useEffect(() => {
    const url = searchParams.get("callbackUrl") || window.location.origin;
    setCallbackUrl(url);
  }, [searchParams]);

  const handleLogin = (provider: string) => {
    const state = encodeURIComponent(callbackUrl);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
    window.location.href = `${backendUrl}/auth/${provider}/login?state=${state}`;
  };

  return (
    <Column fillWidth center padding="l" style={{ minHeight: "100vh" }}>
      <Column
          center gap="16" padding="40" maxWidth={32} radius="xl" background="page" border="accent-alpha-weak"
      >
        <Heading variant="display-default-s" align="center">
          Auth Service
        </Heading>

        <Text onBackground="neutral-weak" align="center" variant="body-default-s">
          Sign in to access
          {callbackUrl !== '/' && callbackUrl !== '' ? ' your application' : ' the service'}
        </Text>

          <Row onBackground="neutral-weak" fillWidth gap="24" vertical="center">
              <Line />/<Line />
          </Row>

        <Column fillWidth gap="s">
            <Button
                variant="secondary"
                onClick={() => handleLogin('google')}
                fillWidth
                prefixIcon="google"
            >
                Continue with Google
            </Button>

             <Button
                variant="secondary"
                onClick={() => handleLogin('discord')}
                fillWidth
                prefixIcon="discord"
            >
                Continue with Discord
            </Button>
        </Column>

        {callbackUrl !== '/' && (
            <Text variant="body-default-xs" onBackground="neutral-weak">
               Redirect target: {callbackUrl}
            </Text>
        )}
      </Column>
    </Column>
  );
}

export default function Home() {
    return (
        <Suspense fallback={<Heading>Loading...</Heading>}>
            <LoginContent />
        </Suspense>
    )
}
