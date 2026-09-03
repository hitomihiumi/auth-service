import { Button, Column, Feedback, Heading, Text } from "@once-ui-system/core";
import { BACKEND_URL } from "@/lib/admin-api";
import type { PublicProviders } from "@/lib/api-types";

export const dynamic = "force-dynamic";

/** Human-readable text for the error codes a login can bounce back with. */
const ERROR_MESSAGES: Record<string, string> = {
  email_already_registered:
    "An account with this email already exists for a different sign-in method.",
  user_blocked: "This account has been blocked.",
  provider_error: "The sign-in provider could not complete the request.",
  invalid_state: "This sign-in link has expired. Please try again.",
  missing_code: "The sign-in provider did not return an authorization code.",
  mfa_required:
    "This application requires a code from an authenticator app, and the " +
    "application you came from does not collect one.",
  invalid_mfa_challenge:
    "The second-factor prompt expired or was already used. Please sign in " +
    "again.",
  mfa_attempts_exhausted:
    "Too many incorrect codes were entered. Please sign in again.",
  unknown_user: "This account no longer exists.",
};

async function loadProviders(slug: string): Promise<PublicProviders | null> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/public/applications/${encodeURIComponent(slug)}/providers`,
      { cache: "no-store" },
    );

    return response.ok ? ((await response.json()) as PublicProviders) : null;
  } catch {
    return null;
  }
}

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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const slug = first(params.app) ?? first(params.client_id);
  // `callbackUrl` was the pre-multi-tenant parameter name.
  const redirectUri = first(params.redirect_uri) ?? first(params.callbackUrl);
  const consumerState = first(params.state);
  const error = first(params.error);

  if (!slug) {
    return (
      <Shell>
        <Heading variant="heading-strong-m" align="center">
          Auth Service
        </Heading>
        <Feedback
          variant="warning"
          title="Missing application"
          description="Add ?app=<slug> to this URL. Each application has its own sign-in options."
        />
      </Shell>
    );
  }

  const data = await loadProviders(slug);

  if (!data) {
    return (
      <Shell>
        <Heading variant="heading-strong-m" align="center">
          Auth Service
        </Heading>
        <Feedback
          variant="danger"
          title="Unknown application"
          description={`No active application is registered as "${slug}".`}
        />
      </Shell>
    );
  }

  const startUrl = (providerSlug: string): string => {
    const url = new URL(
      `${BACKEND_URL}/auth/${encodeURIComponent(data.application.slug)}/${encodeURIComponent(providerSlug)}/start`,
    );
    if (redirectUri) {
      url.searchParams.set("redirect_uri", redirectUri);
    }
    if (consumerState) {
      url.searchParams.set("state", consumerState);
    }
    return url.toString();
  };

  return (
    <Shell>
      <Heading variant="display-default-s" align="center">
        {data.application.name}
      </Heading>

      <Text onBackground="neutral-weak" align="center" variant="body-default-s">
        Choose how you want to sign in
      </Text>

      {error && (
        <Feedback
          variant="danger"
          description={ERROR_MESSAGES[error] ?? "Sign-in could not be completed."}
        />
      )}

      {data.providers.length === 0 ? (
        <Feedback
          variant="warning"
          description="This application has no sign-in methods configured yet."
        />
      ) : (
        <Column fillWidth gap="s">
          {data.providers.map((provider) => (
            <Button
              key={provider.slug}
              href={startUrl(provider.slug)}
              variant="secondary"
              fillWidth
              prefixIcon={provider.iconName ?? "key"}
            >
              {provider.displayName}
            </Button>
          ))}
        </Column>
      )}
    </Shell>
  );
}
