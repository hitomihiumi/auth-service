import { Injectable } from '@nestjs/common';
import { InvalidRedirectUriError } from '../common/errors';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Decides where a completed login is allowed to send the browser.
 *
 * The service previously took this target straight from the OAuth `state`
 * parameter and redirected to it, which meant anyone could have a freshly
 * minted JWT delivered to a domain they controlled. Targets are now compared
 * against a per-application allowlist, and a mismatch is an error response —
 * never a redirect to the requested value.
 */
@Injectable()
export class RedirectUriValidator {
  /**
   * Reduces a URI to the part that is compared: scheme, host, port and path.
   * Query and fragment are dropped, so a registration stays stable while
   * consumers vary their own parameters.
   */
  normalize(raw: string): string {
    let url: URL;
    try {
      // Parsing without a base rejects the scheme-relative and backslash tricks
      // ("//evil.com", "/\evil.com") that a prefix check would let through.
      url = new URL(raw);
    } catch {
      throw new InvalidRedirectUriError(`"${raw}" is not an absolute URI`);
    }

    if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
      throw new InvalidRedirectUriError(
        `scheme "${url.protocol}" is not allowed; use http or https`,
      );
    }

    // "http://localhost:5173@evil.com" parses with host evil.com — reject
    // credentials outright rather than relying on readers to spot the host.
    if (url.username || url.password) {
      throw new InvalidRedirectUriError(
        'credentials are not allowed in a redirect URI',
      );
    }

    if (!url.hostname) {
      throw new InvalidRedirectUriError('a host is required');
    }

    if (url.hostname.includes('*')) {
      throw new InvalidRedirectUriError('wildcards are not allowed');
    }

    const path = url.pathname.replace(/\/+$/, '');

    return `${url.protocol}//${url.host}${path}`;
  }

  /**
   * Validates a URI at registration time. Plaintext HTTP is confined to
   * loopback so a development convenience cannot become a production hole.
   */
  normalizeForRegistration(raw: string): string {
    const normalized = this.normalize(raw);
    const url = new URL(normalized);

    if (url.protocol === 'http:' && !LOOPBACK_HOSTS.has(url.hostname)) {
      throw new InvalidRedirectUriError(
        'plain http is only allowed for loopback addresses; use https',
      );
    }

    return normalized;
  }

  /**
   * Resolves the target for a login. With no requested URI the application's
   * first registration is used, which keeps single-callback integrations simple.
   */
  resolve(requested: string | undefined, allowlist: string[]): string {
    if (allowlist.length === 0) {
      throw new InvalidRedirectUriError(
        'the application has no registered redirect URIs',
      );
    }

    if (!requested) {
      return allowlist[0];
    }

    const normalized = this.normalize(requested);

    if (!allowlist.includes(normalized)) {
      throw new InvalidRedirectUriError(
        `"${requested}" is not registered for this application`,
      );
    }

    return normalized;
  }

  /** Appends the result of a login to the validated target. */
  appendParams(uri: string, params: Record<string, string | null>): string {
    const url = new URL(uri);

    for (const [key, value] of Object.entries(params)) {
      if (value !== null) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }
}
