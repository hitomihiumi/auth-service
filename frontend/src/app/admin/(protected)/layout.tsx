import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminIdentity } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await getAdminIdentity();

  if (!admin) {
    redirect("/admin/login");
  }

  return <AdminShell adminEmail={admin.email}>{children}</AdminShell>;
}
