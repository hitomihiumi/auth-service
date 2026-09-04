"use client";

import {
  Button,
  Column,
  Feedback,
  Heading,
  Input,
  Row,
  Spinner,
  Text,
} from "@once-ui-system/core";
import { QRCodeSVG } from "qrcode.react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { CopyableField } from "@/components/admin/CopyableField";
import { ApiError, mfaApi } from "@/lib/admin-api";
import type { MfaChallenge } from "@/lib/api-types";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Column fillWidth center padding="l" style={{ minHeight: "100vh" }}>
      <Column
        center
        gap="16"
        padding="40"
        maxWidth={32}
        fillWidth
        radius="xl"
        background="page"
        border="accent-alpha-weak"
      >
        {children}
      </Column>
    </Column>
  );
}

/**
 * Recovery codes are shown once, at the end of an enrolment, and the browser is
 * held here until they are acknowledged — leaving before they are written down
 * turns a lost phone into a support request.
 */
function RecoveryCodes({
  codes,
  onContinue,
}: {
  codes: string[];
  onContinue: () => void;
}) {
  return (
    <>
      <Heading variant="heading-strong-m" align="center">
        Save your recovery codes
      </Heading>
      <Text variant="body-default-s" onBackground="neutral-weak" align="center">
        Each code signs you in once if you lose your authenticator app. This is
        the only time they are shown.
      </Text>

      <Column
        fillWidth
        gap="4"
        padding="16"
        radius="m"
        border="neutral-alpha-weak"
        background="neutral-alpha-weak"
      >
        {codes.map((code) => (
          <Text key={code} variant="code-default-m" align="center">
            {code}
          </Text>
        ))}
      </Column>

      <Row fillWidth gap="8">
        <Button
          variant="secondary"
          fillWidth
          onClick={() => {
            void navigator.clipboard?.writeText(codes.join("\n"));
          }}
        >
          Copy
        </Button>
        <Button fillWidth onClick={onContinue}>
          I have saved them
        </Button>
      </Row>
    </>
  );
}

/** A challenge that is gone, rather than one that was merely answered wrongly. */
function isTerminal(error: ApiError): boolean {
  return /expired|already been used|Too many/i.test(error.message);
}

function ChallengeForm({ token }: { token: string }) {
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [destination, setDestination] = useState<string | null>(null);

  const gone = (caught: unknown): string =>
    caught instanceof ApiError
      ? caught.message
      : "This sign-in could not be resumed.";

  useEffect(() => {
    mfaApi
      .challenge(token)
      .then(setChallenge)
      .catch((caught: unknown) => setFatal(gone(caught)));
  }, [token]);

  const leave = useCallback((url: string) => {
    window.location.replace(url);
  }, []);

  const refresh = async () => {
    try {
      setChallenge(await mfaApi.challenge(token));
    } catch (caught) {
      setFatal(gone(caught));
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      const result = await mfaApi.verify(token, code);

      // A first enrolment stops to show the recovery codes; every other login
      // goes straight back to the application that asked for it.
      if (result.recoveryCodes) {
        setRecoveryCodes(result.recoveryCodes);
        setDestination(result.redirectUrl);
      } else {
        leave(result.redirectUrl);
      }
    } catch (caught) {
      setCode("");

      // A spent, expired or exhausted challenge cannot be retried here: the
      // sign-in has to start again from the beginning.
      const terminal =
        caught instanceof ApiError &&
        (caught.status !== 400 || isTerminal(caught));

      if (terminal) {
        setFatal(gone(caught));
      } else {
        setError(
          caught instanceof Error ? caught.message : "That code did not match.",
        );
        // Re-read so the attempts left on screen stay honest.
        void refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  if (fatal) {
    return (
      <Shell>
        <Heading variant="heading-strong-m" align="center">
          Sign-in interrupted
        </Heading>
        <Feedback variant="danger" description={fatal} />
        <Text
          variant="body-default-xs"
          onBackground="neutral-weak"
          align="center"
        >
          Start the sign-in again from the application you came from.
        </Text>
      </Shell>
    );
  }

  if (!challenge) {
    return (
      <Shell>
        <Spinner />
      </Shell>
    );
  }

  if (recoveryCodes && destination) {
    return (
      <Shell>
        <RecoveryCodes
          codes={recoveryCodes}
          onContinue={() => leave(destination)}
        />
      </Shell>
    );
  }

  const enrolment = challenge.mode === "enrol" ? challenge.enrollment : null;

  return (
    <Shell>
      <Heading variant="display-default-s" align="center">
        {challenge.application.name}
      </Heading>

      {enrolment ? (
        <>
          <Text
            variant="body-default-s"
            onBackground="neutral-weak"
            align="center"
          >
            This application requires an authenticator app. Scan this with
            Google Authenticator, Authy, 1Password or any other TOTP app, then
            enter the six digits it shows.
          </Text>

          <Row
            padding="16"
            radius="m"
            border="neutral-alpha-weak"
            horizontal="center"
          >
            <QRCodeSVG value={enrolment.otpauthUri} size={176} level="M" />
          </Row>

          <CopyableField
            label="Or enter this key by hand"
            value={enrolment.secret}
            description={`${enrolment.algorithm}, ${enrolment.digits} digits, ${enrolment.period}s`}
          />
        </>
      ) : (
        <Text
          variant="body-default-s"
          onBackground="neutral-weak"
          align="center"
        >
          Enter the code from your authenticator app for {challenge.account}, or
          one of your recovery codes.
        </Text>
      )}

      {error && <Feedback variant="danger" description={error} />}

      <Column fillWidth gap="8">
        <Input
          id="mfa-code"
          label="Authentication code"
          value={code}
          autoComplete="one-time-code"
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && code.trim().length >= 6) {
              void submit();
            }
          }}
        />
        <Button
          fillWidth
          disabled={busy || code.trim().length < 6}
          onClick={() => void submit()}
        >
          {enrolment ? "Confirm and sign in" : "Sign in"}
        </Button>
      </Column>

      <Text
        variant="body-default-xs"
        onBackground="neutral-weak"
        align="center"
      >
        {challenge.attemptsRemaining} attempt
        {challenge.attemptsRemaining === 1 ? "" : "s"} left before this sign-in
        has to be started again.
      </Text>
    </Shell>
  );
}

function MfaPageContent() {
  const [token, setToken] = useState<string | null>(null);

  // Read from `location` rather than through the router, so the handle never
  // reaches a server component's props or a prefetch.
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  if (token === null) {
    return (
      <Shell>
        <Spinner />
      </Shell>
    );
  }

  if (token === "") {
    return (
      <Shell>
        <Heading variant="heading-strong-m" align="center">
          Nothing to confirm
        </Heading>
        <Feedback
          variant="warning"
          description="This page is reached part-way through a sign-in, and this link carries no challenge."
        />
      </Shell>
    );
  }

  return <ChallengeForm token={token} />;
}

export default function MfaPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <Spinner />
        </Shell>
      }
    >
      <MfaPageContent />
    </Suspense>
  );
}
