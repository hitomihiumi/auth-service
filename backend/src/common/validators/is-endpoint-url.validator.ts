import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * An absolute https URL, or http when it points at loopback.
 *
 * The loopback exemption mirrors the redirect-URI policy and exists so a local
 * or test identity provider can be configured without weakening the rule for
 * anything reachable over a network.
 */
export function IsEndpointUrl(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isEndpointUrl',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') {
            return false;
          }

          let url: URL;
          try {
            url = new URL(value);
          } catch {
            return false;
          }

          if (url.username || url.password) {
            return false;
          }

          if (url.protocol === 'https:') {
            return true;
          }

          return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be an https URL (http is allowed only for loopback)`;
        },
      },
    });
  };
}
