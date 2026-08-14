import { cookies } from "next/headers";
import { BACKEND_URL } from "./admin-api";
import type { AdminIdentity } from "./api-types";

/**
 * Resolves the admin session on the server.
 *
 * The session cookie is httpOnly, so it has to be forwarded explicitly from the
 * incoming request. Checking here rather than in the browser means protected
 * content is never rendered and then hidden.
 */
export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const cookieStore = await cookies();
  const header = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  if (!header) {
    return null;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/admin/auth/me`, {
      headers: { cookie: header },
      cache: "no-store",
    });

    return response.ok ? ((await response.json()) as AdminIdentity) : null;
  } catch {
    // The backend being unreachable is not an authenticated session.
    return null;
  }
}
