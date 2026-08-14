"use client";

import {
  Button,
  Column,
  Feedback,
  Heading,
  Input,
  Row,
  Spinner,
  Switch,
  Tag,
  Text,
} from "@once-ui-system/core";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import type { ApplicationSummary } from "@/lib/api-types";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [allowEmailLinking, setAllowEmailLinking] = useState(false);

  const load = useCallback(async () => {
    try {
      const page = await adminApi.listApplications();
      setApplications(page.items);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);

    try {
      await adminApi.createApplication({ name, slug, allowEmailLinking });
      setName("");
      setSlug("");
      setAllowEmailLinking(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create");
    } finally {
      setCreating(false);
    }
  };

  const slugIsValid = slug.length === 0 || SLUG_PATTERN.test(slug);

  return (
    <Column fillWidth gap="32">
      <Column gap="16" fillWidth>
        <Heading variant="heading-strong-m">Applications</Heading>

        {error && <Feedback variant="danger" description={error} />}

        {loading ? (
          <Row fillWidth center padding="32">
            <Spinner />
          </Row>
        ) : applications.length === 0 ? (
          <Feedback
            variant="info"
            title="No applications yet"
            description="Register one below, then add the login providers it should offer."
          />
        ) : (
          <Column fillWidth gap="8">
            {applications.map((application) => (
              <Link
                key={application.id}
                href={`/admin/applications/${application.id}`}
                style={{ textDecoration: "none" }}
              >
                <Row
                  fillWidth
                  horizontal="between"
                  vertical="center"
                  padding="16"
                  radius="m"
                  border="neutral-alpha-weak"
                  background="neutral-alpha-weak"
                >
                  <Column gap="4">
                    <Row gap="8" vertical="center">
                      <Text variant="label-strong-s">{application.name}</Text>
                      {!application.isActive && (
                        <Tag variant="danger" size="s">
                          disabled
                        </Tag>
                      )}
                    </Row>
                    <Text variant="code-default-xs" onBackground="neutral-weak">
                      {application.slug}
                    </Text>
                  </Column>
                  <Text variant="body-default-xs" onBackground="neutral-weak">
                    {application._count?.providers ?? 0} provider(s) ·{" "}
                    {application._count?.users ?? 0} user(s)
                  </Text>
                </Row>
              </Link>
            ))}
          </Column>
        )}
      </Column>

      <Column
        as="form"
        onSubmit={create}
        fillWidth
        gap="16"
        padding="24"
        radius="l"
        border="neutral-alpha-weak"
      >
        <Heading variant="heading-strong-s">Register an application</Heading>

        <Input
          id="app-name"
          label="Name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        <Input
          id="app-slug"
          label="Slug"
          required
          value={slug}
          error={!slugIsValid}
          errorMessage={
            slugIsValid ? undefined : "Lowercase letters, digits and hyphens only"
          }
          description="Appears in the login URL and cannot be changed later."
          onChange={(event) => setSlug(event.target.value.toLowerCase())}
        />

        <Switch
          id="app-linking"
          label="Link accounts by verified email"
          description="Off by default: linking on an unverified address lets a provider assert its way into an existing account."
          isChecked={allowEmailLinking}
          onToggle={() => setAllowEmailLinking((value) => !value)}
        />

        <Row>
          <Button
            type="submit"
            loading={creating}
            disabled={creating || !slugIsValid || !slug || !name}
          >
            Create
          </Button>
        </Row>
      </Column>
    </Column>
  );
}
