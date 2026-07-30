import pino from 'pino';

import type { AppLogger } from '../jobs/app-logger';

export class PinoAppLogger implements AppLogger {
  private readonly logger: pino.Logger;

  constructor(level: string) {
    this.logger = pino({
      level,
      base: null,
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.logger.error(context ?? {}, message);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logger.warn(context ?? {}, message);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.logger.info(context ?? {}, message);
  }
}
