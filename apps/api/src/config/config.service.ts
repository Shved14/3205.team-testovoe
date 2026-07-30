import type { AppEnv } from './env.schema';
import { parseEnv } from './env.schema';

export class AppConfigService {
  private readonly env: AppEnv;

  constructor(env: AppEnv = parseEnv()) {
    this.env = env;
  }

  get nodeEnv(): AppEnv['NODE_ENV'] {
    return this.env.NODE_ENV;
  }

  get port(): number {
    return this.env.PORT;
  }

  get logLevel(): AppEnv['LOG_LEVEL'] {
    return this.env.LOG_LEVEL;
  }

  get corsOrigin(): string | undefined {
    return this.env.CORS_ORIGIN;
  }

  get perJobConcurrency(): number {
    return this.env.PER_JOB_CONCURRENCY;
  }

  get maxArtificialDelayMs(): number {
    return this.env.MAX_ARTIFICIAL_DELAY_MS;
  }

  get cancelStrategy(): AppEnv['CANCEL_STRATEGY'] {
    return this.env.CANCEL_STRATEGY;
  }

  get requestTimeoutMs(): number {
    return this.env.REQUEST_TIMEOUT_MS;
  }

  get jobTtlMs(): number {
    return this.env.JOB_TTL_MS;
  }

  get maxJobs(): number {
    return this.env.MAX_JOBS;
  }

  get cleanupIntervalMs(): number {
    return this.env.CLEANUP_INTERVAL_MS;
  }

  get shutdownTimeoutMs(): number {
    return this.env.SHUTDOWN_TIMEOUT_MS;
  }

  get isDevelopment(): boolean {
    return this.env.NODE_ENV === 'development';
  }
}
