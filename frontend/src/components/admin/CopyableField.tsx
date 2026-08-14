"use client";

import { Button, Column, Row, Text } from "@once-ui-system/core";
import { useState } from "react";

interface CopyableFieldProps {
  label: string;
  value: string;
  description?: string;
}

/**
 * Values an admin has to paste elsewhere — most importantly the provider
 * callback URL, which must be registered in the Google or Discord console
 * before a login can succeed.
 */
export function CopyableField({ label, value, description }: CopyableFieldProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Column fillWidth gap="4">
      <Text variant="label-default-s" onBackground="neutral-weak">
        {label}
      </Text>
      <Row fillWidth gap="8" vertical="center">
        <Row
          fillWidth
          padding="8"
          radius="m"
          border="neutral-alpha-weak"
          background="neutral-alpha-weak"
          style={{ overflowX: "auto" }}
        >
          <Text variant="code-default-s" style={{ whiteSpace: "nowrap" }}>
            {value}
          </Text>
        </Row>
        <Button size="s" variant="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </Row>
      {description && (
        <Text variant="body-default-xs" onBackground="neutral-weak">
          {description}
        </Text>
      )}
    </Column>
  );
}
