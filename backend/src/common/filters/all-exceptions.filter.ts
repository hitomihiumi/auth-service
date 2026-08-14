import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  MalformedSecretError,
  UnknownEncryptionKeyError,
} from '../../crypto/envelope';

/** getStatus() returns a plain number, so the threshold is widened to match. */
const SERVER_ERROR_THRESHOLD: number = HttpStatus.INTERNAL_SERVER_ERROR;

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  requestId: string;
}

/**
 * Single place where anything unhandled becomes a response. Replaces the bare
 * `console.log(error)` that used to sit in the token-verification handler, and
 * makes sure stack traces and secret material never reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = randomUUID();

    const { status, body, logLevel } = this.describe(exception, requestId);

    const context = `${request.method} ${request.url}`;
    if (logLevel === 'error') {
      this.logger.error(
        `${context} -> ${status} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${context} -> ${status} [${requestId}]`);
    }

    response.status(status).json(body);
  }

  private describe(
    exception: unknown,
    requestId: string,
  ): { status: number; body: ErrorBody; logLevel: 'warn' | 'error' } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const body: ErrorBody =
        typeof payload === 'string'
          ? { statusCode: status, message: payload, requestId }
          : ({
              ...payload,
              statusCode: status,
              requestId,
            } as ErrorBody);

      return {
        status,
        body,
        logLevel: status >= SERVER_ERROR_THRESHOLD ? 'error' : 'warn',
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.describePrisma(exception, requestId);
    }

    // A blob we cannot decrypt is an operator problem (a key was dropped from
    // the ring), so name the key in the log — but never echo the ciphertext.
    if (exception instanceof UnknownEncryptionKeyError) {
      this.logger.error(
        `Encryption key "${exception.keyId}" is missing from the keyring`,
      );
    }

    if (
      exception instanceof MalformedSecretError ||
      exception instanceof UnknownEncryptionKeyError
    ) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        body: {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'A stored secret could not be read',
          requestId,
        },
        logLevel: 'error',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        requestId,
      },
      logLevel: 'error',
    };
  }

  private describePrisma(
    exception: Prisma.PrismaClientKnownRequestError,
    requestId: string,
  ): { status: number; body: ErrorBody; logLevel: 'warn' | 'error' } {
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          body: {
            statusCode: HttpStatus.CONFLICT,
            message: 'A record with these values already exists',
            requestId,
          },
          logLevel: 'warn',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          body: {
            statusCode: HttpStatus.NOT_FOUND,
            message: 'Record not found',
            requestId,
          },
          logLevel: 'warn',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          body: {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Database error',
            requestId,
          },
          logLevel: 'error',
        };
    }
  }
}
