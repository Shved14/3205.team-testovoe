import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';

import type { AppConfigService } from '../config/config.service';
import { APP_CONFIG } from '../config/tokens';
import { sleep } from '../common/sleep';
import type { AppLogger } from './app-logger';
import type { JobRunner } from './job-runner';
import type { JobRuntimeRegistry } from './job-runtime-registry';
import {
  APP_LOGGER,
  JOB_RUNNER,
  JOB_RUNTIME_REGISTRY,
} from './tokens';

@Injectable()
export class GracefulShutdownService implements OnModuleDestroy {
  constructor(
    @Inject(JOB_RUNNER) private readonly runner: JobRunner,
    @Inject(JOB_RUNTIME_REGISTRY) private readonly registry: JobRuntimeRegistry,
    @Inject(APP_CONFIG) private readonly config: AppConfigService,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  async onModuleDestroy(): Promise<void> {
    const activeIds = this.registry.jobIds();
    this.logger.info('Shutting down: aborting active jobs', {
      activeJobs: activeIds.length,
    });

    for (const jobId of activeIds) {
      this.runner.cancel(jobId);
    }

    const deadline = this.config.shutdownTimeoutMs;
    const waitStarted = performance.now();
    const idle = new AbortController();

    while (this.registry.size() > 0) {
      if (performance.now() - waitStarted >= deadline) {
        this.logger.warn('Shutdown timeout reached with active jobs', {
          remaining: this.registry.size(),
        });
        break;
      }
      await sleep(25, idle.signal);
    }
  }
}
