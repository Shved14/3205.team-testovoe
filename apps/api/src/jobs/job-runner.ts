import type { CheckOutcome } from '../checker/url-checker';
import type { UrlChecker } from '../checker/url-checker';
import type { Clock } from '../common/clock';
import type { RandomService } from '../common/random.service';
import { runPool } from '../common/run-pool';
import type { SleepService } from '../common/sleep.service';
import type { AppLogger } from './app-logger';
import type { UrlItemEntity } from './job.entity';
import type { JobRuntimeRegistry } from './job-runtime-registry';
import type { JobStore } from './job-store';
import type { JobsConfig } from './jobs-config';
import { isTerminalUrlStatus } from './job-transitions';

const INTERNAL_ERROR_MESSAGE_MAX_LENGTH = 300;

export type JobRunnerDependencies = {
  store: JobStore;
  checker: UrlChecker;
  sleep: SleepService;
  random: RandomService;
  clock: Clock;
  config: JobsConfig;
  logger: AppLogger;
  registry: JobRuntimeRegistry;
};

export class JobRunner {
  private readonly store: JobStore;
  private readonly checker: UrlChecker;
  private readonly sleep: SleepService;
  private readonly random: RandomService;
  private readonly clock: Clock;
  private readonly config: JobsConfig;
  private readonly logger: AppLogger;
  private readonly registry: JobRuntimeRegistry;

  constructor(dependencies: JobRunnerDependencies) {
    this.store = dependencies.store;
    this.checker = dependencies.checker;
    this.sleep = dependencies.sleep;
    this.random = dependencies.random;
    this.clock = dependencies.clock;
    this.config = dependencies.config;
    this.logger = dependencies.logger;
    this.registry = dependencies.registry;
  }

  async start(jobId: string): Promise<void> {
    const claimController = new AbortController();
    const workController = new AbortController();
    this.registry.set(jobId, { claimController, workController });

    try {
      const items = this.store.markInProgress(jobId);
      await runPool(
        items,
        this.config.perJobConcurrency,
        async (item) => {
          await this.processOne(jobId, item, workController.signal);
        },
        claimController.signal,
      );
      this.store.finalize(jobId);
    } catch (error) {
      const message = readErrorMessage(error);
      this.logger.error('Job runner failed', {
        jobId,
        error: message,
        at: this.clock.now().toISOString(),
      });
      try {
        this.store.fail(jobId, message);
      } catch (failError) {
        this.logger.error('Failed to mark job as failed', {
          jobId,
          error: readErrorMessage(failError),
        });
      }
    } finally {
      this.registry.delete(jobId);
    }
  }

  cancel(jobId: string): void {
    const runtime = this.registry.get(jobId);
    if (runtime !== undefined) {
      runtime.claimController.abort();
      if (this.config.cancelStrategy === 'abort') {
        runtime.workController.abort();
      }
    }

    const job = this.store.getById(jobId);
    if (job === undefined) {
      return;
    }

    if (job.status === 'pending' || job.status === 'running') {
      this.store.requestCancel(jobId);
    }

    if (runtime === undefined && job.status === 'pending') {
      const cancelled = this.store.getById(jobId);
      if (cancelled !== undefined && cancelled.status === 'pending') {
        this.store.finalize(jobId);
      }
    }
  }

  private async processOne(
    jobId: string,
    item: UrlItemEntity,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      if (signal.aborted) {
        this.store.cancelUrl(jobId, item.id);
        return;
      }

      this.store.startUrl(jobId, item.id);

      const outcome: CheckOutcome = await this.checker.check(item.url, signal);
      if (outcome.kind === 'aborted') {
        this.store.cancelUrl(jobId, item.id);
        return;
      }

      const delayMs = this.random.intBetween(0, this.config.maxArtificialDelayMs);
      const finishedSleep = await this.sleep.wait(delayMs, signal);
      if (!finishedSleep) {
        this.store.cancelUrl(jobId, item.id);
        return;
      }

      this.store.setUrlResult(jobId, item.id, outcome, delayMs);
    } catch (error) {
      this.writeInternalError(jobId, item.id, error);
    }
  }

  private writeInternalError(jobId: string, urlId: string, error: unknown): void {
    try {
      const job = this.store.getById(jobId);
      const current = job?.items.find((candidate) => candidate.id === urlId);
      if (current === undefined || isTerminalUrlStatus(current.status)) {
        return;
      }

      if (current.status === 'pending') {
        this.store.startUrl(jobId, urlId);
      }

      this.store.setUrlResult(
        jobId,
        urlId,
        {
          kind: 'error',
          errorCode: 'INTERNAL_ERROR',
          errorMessage: truncateMessage(readErrorMessage(error)),
          httpDurationMs: null,
        },
        0,
      );
    } catch (writeError) {
      this.logger.error('Failed to persist INTERNAL_ERROR for URL', {
        jobId,
        urlId,
        error: readErrorMessage(writeError),
      });
    }
  }
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  return 'Unknown error';
}

function truncateMessage(message: string): string {
  if (message.length <= INTERNAL_ERROR_MESSAGE_MAX_LENGTH) {
    return message;
  }
  return message.slice(0, INTERNAL_ERROR_MESSAGE_MAX_LENGTH);
}
