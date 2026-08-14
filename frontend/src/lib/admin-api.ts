import type {
  AdminIdentity,
  AppUser,
  ApplicationDetail,
  ApplicationSummary,
  Paginated,
  Provider,
  ProviderKind,
  ProviderKindInfo,
  RedirectUri,
} from "./api-types";

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorBody {
  message?: string | string[];
}

/**
 * The admin session is an httpOnly cookie, so every call must opt into sending
 * credentials — and the token is never readable from JavaScript.
 */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as ErrorBody;
      if (body.message) {
        message = Array.isArray(body.message)
          ? body.message.join(", ")
          : body.message;
      }
    } catch {
      // Keep the status-based message when the body is not JSON.
    }
    throw new ApiError(response.status, message);
  }

  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export interface CreateApplicationInput {
  slug: string;
  name: string;
  description?: string;
  tokenTtlSeconds?: number;
  allowEmailLinking?: boolean;
}

export interface CreateProviderInput {
  kind: ProviderKind;
  slug: string;
  displayName: string;
  clientId: string;
  clientSecret: string;
  iconName?: string;
  scopes?: string[];
  authorizationUrl?: string;
  tokenUrl?: string;
  userinfoUrl?: string;
  issuer?: string;
  claimSub?: string;
  claimEmail?: string;
  claimUsername?: string;
  claimAvatar?: string;
}

export const adminApi = {
  login: (email: string, password: string) =>
    request<{ email: string; role: string }>("/admin/auth/login", {
      method: "POST",
      ...json({ email, password }),
    }),

  logout: () => request<void>("/admin/auth/logout", { method: "POST" }),

  me: () => request<AdminIdentity>("/admin/auth/me"),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("/admin/auth/change-password", {
      method: "POST",
      ...json({ currentPassword, newPassword }),
    }),

  providerKinds: () => request<ProviderKindInfo[]>("/admin/provider-kinds"),

  listApplications: () =>
    request<Paginated<ApplicationSummary>>("/admin/applications"),

  getApplication: (id: string) =>
    request<ApplicationDetail>(`/admin/applications/${id}`),

  createApplication: (input: CreateApplicationInput) =>
    request<ApplicationDetail>("/admin/applications", {
      method: "POST",
      ...json(input),
    }),

  updateApplication: (id: string, input: Partial<CreateApplicationInput> & { isActive?: boolean }) =>
    request<ApplicationDetail>(`/admin/applications/${id}`, {
      method: "PATCH",
      ...json(input),
    }),

  deleteApplication: (id: string, confirmSlug: string) =>
    request<void>(
      `/admin/applications/${id}?confirm=${encodeURIComponent(confirmSlug)}`,
      { method: "DELETE" },
    ),

  rotateSigningKey: (id: string) =>
    request<ApplicationDetail>(`/admin/applications/${id}/signing-keys/rotate`, {
      method: "POST",
    }),

  addRedirectUri: (applicationId: string, uri: string) =>
    request<RedirectUri>(`/admin/applications/${applicationId}/redirect-uris`, {
      method: "POST",
      ...json({ uri }),
    }),

  removeRedirectUri: (applicationId: string, uriId: string) =>
    request<void>(
      `/admin/applications/${applicationId}/redirect-uris/${uriId}`,
      { method: "DELETE" },
    ),

  createProvider: (applicationId: string, input: CreateProviderInput) =>
    request<Provider>(`/admin/applications/${applicationId}/providers`, {
      method: "POST",
      ...json(input),
    }),

  updateProvider: (providerId: string, input: Partial<CreateProviderInput> & { isEnabled?: boolean }) =>
    request<Provider>(`/admin/providers/${providerId}`, {
      method: "PATCH",
      ...json(input),
    }),

  rotateProviderSecret: (providerId: string, clientSecret: string) =>
    request<Provider>(`/admin/providers/${providerId}/rotate-secret`, {
      method: "POST",
      ...json({ clientSecret }),
    }),

  removeProvider: (providerId: string) =>
    request<void>(`/admin/providers/${providerId}`, { method: "DELETE" }),

  listUsers: (applicationId: string, query = "") =>
    request<Paginated<AppUser>>(
      `/admin/applications/${applicationId}/users${query ? `?q=${encodeURIComponent(query)}` : ""}`,
    ),

  setUserBlocked: (userId: string, isBlocked: boolean) =>
    request<AppUser>(`/admin/users/${userId}/blocked`, {
      method: "PATCH",
      ...json({ isBlocked }),
    }),
};
