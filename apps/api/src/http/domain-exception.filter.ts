import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { API_ERROR_CODES } from '@repo/shared';
import type { Response } from 'express';

import type { AppLogger } from '../jobs/app-logger';
import {
  JobAlreadyFinishedError,
  JobNotFoundError,
} from '../jobs/job-errors';

type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const mapped = mapException(exception);

    if (mapped.status >= 500) {
      this.logger.error('Unhandled request error', {
        code: mapped.body.error.code,
        message: mapped.body.error.message,
      });
    }

    response.status(mapped.status).json(mapped.body);
  }
}

function mapException(exception: unknown): {
  status: number;
  body: ErrorEnvelope;
} {
  if (exception instanceof JobNotFoundError) {
    return {
      status: HttpStatus.NOT_FOUND,
      body: {
        error: {
          code: exception.code,
          message: exception.message,
          details: { jobId: exception.jobId },
        },
      },
    };
  }

  if (exception instanceof JobAlreadyFinishedError) {
    return {
      status: HttpStatus.CONFLICT,
      body: {
        error: {
          code: exception.code,
          message: exception.message,
          details: { jobId: exception.jobId, status: exception.status },
        },
      },
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const payload = exception.getResponse();

    if (typeof payload === 'object' && payload !== null && 'code' in payload) {
      const record = payload as {
        code: string;
        message?: string;
        details?: unknown;
      };
      return {
        status,
        body: {
          error: {
            code: record.code,
            message: record.message ?? exception.message,
            ...(record.details !== undefined ? { details: record.details } : {}),
          },
        },
      };
    }

    return {
      status,
      body: {
        error: {
          code:
            status === HttpStatus.BAD_REQUEST
              ? API_ERROR_CODES.VALIDATION_ERROR
              : API_ERROR_CODES.INTERNAL_ERROR,
          message: exception.message,
        },
      },
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: {
      error: {
        code: API_ERROR_CODES.INTERNAL_ERROR,
        message: 'Internal server error',
      },
    },
  };
}
