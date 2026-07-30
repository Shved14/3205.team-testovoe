import { Module } from '@nestjs/common';

import type { UrlChecker } from '../checker/url-checker';
import { CheckerModule } from '../checker/checker.module';
import { URL_CHECKER } from '../checker/tokens';
import type { Clock } from '../common/clock';
import { CommonModule } from '../common/common.module';
import type { RandomService } from '../common/random.service';
import type { SleepService } from '../common/sleep.service';
import { CLOCK, RANDOM_SERVICE, SLEEP_SERVICE } from '../common/tokens';
import { SilentLogger } from './app-logger';
import type { AppLogger } from './app-logger';
import { JobRunner } from './job-runner';
import { JobRuntimeRegistry } from './job-runtime-registry';
import { JobStore } from './job-store';
import { DEFAULT_JOBS_CONFIG } from './jobs-config';
import type { JobsConfig } from './jobs-config';
import {
  APP_LOGGER,
  JOB_RUNNER,
  JOB_RUNTIME_REGISTRY,
  JOB_STORE,
  JOBS_CONFIG,
} from './tokens';

@Module({
  imports: [CommonModule, CheckerModule],
  providers: [
    {
      provide: JOB_STORE,
      useFactory: (clock: Clock): JobStore =>
        new JobStore({
          clock,
          startCleanupScheduler: true,
        }),
      inject: [CLOCK],
    },
    {
      provide: JOB_RUNTIME_REGISTRY,
      useClass: JobRuntimeRegistry,
    },
    {
      provide: JOBS_CONFIG,
      useValue: DEFAULT_JOBS_CONFIG,
    },
    {
      provide: APP_LOGGER,
      useClass: SilentLogger,
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
  ],
  exports: [JOB_STORE, JOB_RUNNER, JOB_RUNTIME_REGISTRY, JOBS_CONFIG],
})
export class JobsModule {}
