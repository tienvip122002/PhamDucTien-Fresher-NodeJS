import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'http';
import { QueryFailedError } from 'typeorm';

/** Shape of every error response returned by the API. */
export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  /** Machine-readable code for business errors, e.g. INSUFFICIENT_STOCK. */
  code?: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

interface HttpError {
  statusCode: number;
  message: string | string[];
  code?: string;
}

// https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, message, code } = this.toHttpError(exception);
    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponseBody = {
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      ...(code ? { code } : {}),
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };
    response.status(statusCode).json(body);
  }

  private toHttpError(exception: unknown): HttpError {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        return { statusCode, message: res };
      }
      const { message, code } = res as {
        message?: string | string[];
        code?: string;
      };
      return { statusCode, message: message ?? exception.message, code };
    }

    // Constraint violations that slipped past the service checks
    // (e.g. two requests creating the same SKU at the same time).
    if (exception instanceof QueryFailedError) {
      const pgCode = (exception.driverError as { code?: string }).code;
      if (pgCode === PG_UNIQUE_VIOLATION) {
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'DUPLICATE_VALUE',
          message: 'A record with the same unique value already exists',
        };
      }
      if (pgCode === PG_FOREIGN_KEY_VIOLATION) {
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'REFERENCED_RECORD',
          message: 'The record is referenced by or references another record',
        };
      }
      if (pgCode === PG_CHECK_VIOLATION) {
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'CONSTRAINT_VIOLATION',
          message: 'The change would break a data rule (e.g. negative stock)',
        };
      }
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }
}
