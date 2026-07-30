import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import type { AppLogger } from '../jobs/app-logger';
import { APP_LOGGER } from '../jobs/tokens';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(@Inject(APP_LOGGER) private readonly logger: AppLogger) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    const jobId = readJobId(request);

    response.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.logger.info('HTTP request', {
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Math.round(durationMs),
        ...(jobId !== undefined ? { jobId } : {}),
      });
    });

    next();
  }
}

function readJobId(request: Request): string | undefined {
  const fromParams = request.params['id'];
  if (typeof fromParams === 'string' && fromParams.length > 0) {
    return fromParams;
  }
  return undefined;
}
