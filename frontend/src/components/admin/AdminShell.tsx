"use client";

import { Button, Column, Heading, Row, Text } from "@once-ui-system/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { adminApi } from "@/lib/admin-api";

interface AdminShellProps {
  adminEmail: string;
  breadcrumb?: ReactNode;
  children: ReactNode;
}

export function AdminShell({ adminEmail, breadcrumb, children }: AdminShellProps) {
  const router = useRouter();

  const signOut = async () => {
    await adminApi.logout().catch(() => undefined);
    router.replace("/admin/login");
    router.refresh();
  };

  return (
    <Column fillWidth gap="24" padding="24" horizontal="center">
      <Row
        fillWidth
        maxWidth={64}
        horizontal="between"
        vertical="center"
        paddingBottom="16"
        borderBottom="neutral-alpha-weak"
      >
        <Row gap="12" vertical="center">
          <Link href="/admin" style={{ textDecoration: "none" }}>
            <Heading variant="heading-strong-s">Auth Admin</Heading>
          </Link>
          {breadcrumb}
        </Row>
        <Row gap="12" vertical="center">
          <Text variant="body-default-xs" onBackground="neutral-weak">
            {adminEmail}
          </Text>
          <Button size="s" variant="tertiary" onClick={signOut}>
            Sign out
          </Button>
        </Row>
      </Row>

      <Column fillWidth maxWidth={64} gap="24">
        {children}
      </Column>
    </Column>
  );
}
