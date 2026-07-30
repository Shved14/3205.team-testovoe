import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';

import type { UrlChecker } from '../checker/url-checker';
import { CheckerModule } from '../checker/checker.module';
import { URL_CHECKER } from '../checker/tokens';
import type { Clock } from '../common/clock';
import { CommonModule } from '../common/common.module';
import type { RandomService } from '../common/random.service';
import type { SleepService } from '../common/sleep.service';
import { CLOCK, RANDOM_SERVICE, SLEEP_SERVICE } from '../common/tokens';
import type { AppConfigService } from '../config/config.service';
import { APP_CONFIG } from '../config/tokens';
import { RequestLoggingMiddleware } from '../http/request-logging.middleware';
import { PinoAppLogger } from '../logging/pino-logger';
import type { AppLogger } from './app-logger';
import { GracefulShutdownService } from './graceful-shutdown.service';
import { JobRunner } from './job-runner';
import { JobRuntimeRegistry } from './job-runtime-registry';
import { JobStore } from './job-store';
import { JobsController } from './jobs.controller';
import type { JobsConfig } from './jobs-config';
import { JobsService } from './jobs.service';
import {
  APP_LOGGER,
  JOB_RUNNER,
  JOB_RUNTIME_REGISTRY,
  JOB_STORE,
  JOBS_CONFIG,
  JOBS_SERVICE,
} from './tokens';

@Module({
  imports: [CommonModule, CheckerModule],
  controllers: [JobsController],
  providers: [
    {
      provide: APP_LOGGER,
      useFactory: (config: AppConfigService): AppLogger =>
        new PinoAppLogger(config.logLevel),
      inject: [APP_CONFIG],
    },
    {
      provide: JOBS_CONFIG,
      useFactory: (config: AppConfigService): JobsConfig => ({
        perJobConcurrency: config.perJobConcurrency,
        maxArtificialDelayMs: config.maxArtificialDelayMs,
        cancelStrategy: config.cancelStrategy,
      }),
      inject: [APP_CONFIG],
    },
    {
      provide: JOB_STORE,
      useFactory: (clock: Clock, config: AppConfigService): JobStore =>
        new JobStore({
          clock,
          jobTtlMs: config.jobTtlMs,
          maxJobs: config.maxJobs,
          cleanupIntervalMs: config.cleanupIntervalMs,
          startCleanupScheduler: config.nodeEnv !== 'test',
        }),
      inject: [CLOCK, APP_CONFIG],
    },
    {
      provide: JOB_RUNTIME_REGISTRY,
      useClass: JobRuntimeRegistry,
    },
    {
      provide: JOB_RUNNER,
      useFactory: (
        store: JobStore,
        checker: UrlChecker,
        sleep: SleepService,
        random: RandomService,
        clock: Clock,
        config: JobsConfig,
        logger: AppLogger,
        registry: JobRuntimeRegistry,
      ): JobRunner =>
        new JobRunner({
          store,
          checker,
          sleep,
          random,
          clock,
          config,
          logger,
          registry,
        }),
      inject: [
        JOB_STORE,
        URL_CHECKER,
        SLEEP_SERVICE,
        RANDOM_SERVICE,
        CLOCK,
        JOBS_CONFIG,
        APP_LOGGER,
        JOB_RUNTIME_REGISTRY,
      ],
    },
    {
      provide: JOBS_SERVICE,
      useFactory: (
        store: JobStore,
        runner: JobRunner,
        logger: AppLogger,
      ): JobsService =>
        new JobsService({
          store,
          runner,
          logger,
        }),
      inject: [JOB_STORE, JOB_RUNNER, APP_LOGGER],
    },
    GracefulShutdownService,
    RequestLoggingMiddleware,
  ],
  exports: [
    JOB_STORE,
    JOB_RUNNER,
    JOB_RUNTIME_REGISTRY,
    JOBS_CONFIG,
    JOBS_SERVICE,
    APP_LOGGER,
  ],
})
export class JobsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
