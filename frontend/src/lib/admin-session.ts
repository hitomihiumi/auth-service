import { cookies } from "next/headers";
import type { AdminIdentity } from "./api-types";
import { internalBackendUrl } from "./runtime-config";

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

  const url = `${internalBackendUrl()}/admin/auth/me`;

  try {
    const response = await fetch(url, {
      headers: { cookie: header },
      cache: "no-store",
    });

    if (response.ok) {
      return (await response.json()) as AdminIdentity;
    }

    // 401 is the ordinary "session expired or revoked". Anything else means the
    // request never reached the session check — a wrong INTERNAL_BACKEND_URL
    // pointing at something that is not the API, or a proxy refusing it — and
    // would otherwise look identical to being signed out.
    if (response.status !== 401) {
      console.warn(`Admin session check at ${url} answered ${response.status}`);
    }
    return null;
  } catch (error) {
    // The backend being unreachable is not an authenticated session, but it is
    // worth saying so: silently bouncing to the login page hides the cause.
    console.warn(`Admin session check could not reach ${url}:`, error);
    return null;
  }
}
