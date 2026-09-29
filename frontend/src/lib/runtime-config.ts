/**
 * Addresses the frontend needs to know about, read when the process runs
 * rather than when the image is built — so one published image serves any
 * deployment, configured by environment variables alone.
 *
 * `NEXT_PUBLIC_*` cannot do this: Next.js replaces those with literals during
 * `next build`, which is what tied earlier images to the address they were
 * built for. The variables below carry no such prefix, so they stay live.
 *
 * Server code reads `process.env` directly. The browser cannot, so the root
 * layout renders the same values into a script tag and the client reads them
 * back from `window.__RUNTIME_CONFIG__`.
 */

export interface RuntimeConfig {
  /** Where the browser reaches the API. Must be reachable from the user's machine. */
  backendUrl: string;
  /** Where this frontend is served; used for canonical and social metadata. */
  frontendUrl: string;
}

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

const DEFAULT_BACKEND_URL = "http://localhost:4000";
const DEFAULT_FRONTEND_URL = "http://localhost:3430";

/** Blank counts as unset (Compose renders `${VAR:-}` as an empty string). */
function read(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim().replace(/\/+$/, "");
    if (value) {
      return value;
    }
  }
  return undefined;
}

/** Server only: resolved from the live environment on every call. */
export function serverRuntimeConfig(): RuntimeConfig {
  return {
    // The NEXT_PUBLIC_ names are the pre-runtime-config spelling, still honoured
    // for anyone whose deployment sets them.
    backendUrl:
      read("PUBLIC_BACKEND_URL", "NEXT_PUBLIC_BACKEND_URL") ?? DEFAULT_BACKEND_URL,
    frontendUrl:
      read("PUBLIC_FRONTEND_URL", "NEXT_PUBLIC_FRONTEND_URL") ?? DEFAULT_FRONTEND_URL,
  };
}

/** The API address as the *browser* must use it — also the one to put in links. */
export function publicBackendUrl(): string {
  if (typeof window !== "undefined") {
    return window.__RUNTIME_CONFIG__?.backendUrl ?? DEFAULT_BACKEND_URL;
  }
  return serverRuntimeConfig().backendUrl;
}

/**
 * The API address for requests the *server* makes on its own behalf.
 *
 * Inside a container network the public hostname is a needless detour through
 * the proxy (and may not resolve from there at all), so an internal address can
 * be given; without one the public address is used.
 */
export function internalBackendUrl(): string {
  return read("INTERNAL_BACKEND_URL") ?? serverRuntimeConfig().backendUrl;
}

/** Serialised for an inline script; `<` is escaped so a value cannot close the tag. */
export function runtimeConfigScript(config: RuntimeConfig): string {
  const json = JSON.stringify(config).replace(/</g, "\\u003c");
  return `window.__RUNTIME_CONFIG__=${json};`;
}
