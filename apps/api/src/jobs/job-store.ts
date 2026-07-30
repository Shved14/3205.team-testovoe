import { randomUUID } from 'node:crypto';

import type { JobStatus } from '@repo/shared';

import type { CheckOutcome } from '../checker/url-checker';
import type { Clock } from '../common/clock';
import {
  CLEANUP_INTERVAL_MS,
  JOB_TTL_MS,
  MAX_JOBS,
} from './constants';
import type { JobEntity, JobListQuery, UrlItemEntity } from './job.entity';
import { cloneJob, cloneUrlItems, toDetail, toSummary } from './job-mappers';
import {
  areAllUrlsTerminal,
  hasCancelledUrl,
} from './job-stats';
import { InvalidTransitionError } from './invalid-transition.error';
import {
  assertJobMutable,
  assertJobTransition,
  assertUrlTransition,
  isTerminalJobStatus,
  isTerminalUrlStatus,
} from './job-transitions';

export type JobStoreOptions = {
  clock: Clock;
  jobTtlMs?: number;
  maxJobs?: number;
  cleanupIntervalMs?: number;
  startCleanupScheduler?: boolean;
  createId?: () => string;
};

export class JobStore {
  private readonly jobs = new Map<string, JobEntity>();
  private readonly clock: Clock;
  private readonly jobTtlMs: number;
  private readonly maxJobs: number;
  private readonly createId: () => string;
  private readonly cleanupTimer: NodeJS.Timeout | undefined;

  constructor(options: JobStoreOptions) {
    this.clock = options.clock;
    this.jobTtlMs = options.jobTtlMs ?? JOB_TTL_MS;
    this.maxJobs = options.maxJobs ?? MAX_JOBS;
    this.createId = options.createId ?? randomUUID;

    if (options.startCleanupScheduler ?? true) {
      const intervalMs = options.cleanupIntervalMs ?? CLEANUP_INTERVAL_MS;
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, intervalMs);
      this.cleanupTimer.unref();
    }
  }

  dispose(): void {
    if (this.cleanupTimer !== undefined) {
      clearInterval(this.cleanupTimer);
    }
  }

  create(urls: readonly string[]): JobEntity {
    const now = this.nowIso();
    const jobId = this.createId();
    const items: UrlItemEntity[] = urls.map((url) => ({
      id: this.createId(),
      url,
      status: 'pending',
      httpStatusCode: null,
      errorCode: null,
      errorMessage: null,
      finalUrl: null,
      redirected: false,
      delayMs: null,
      httpDurationMs: null,
      startedAt: null,
      finishedAt: null,
    }));

    const job: JobEntity = {
      id: jobId,
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      status: 'pending',
      version: 1,
      items,
      errorMessage: null,
    };

    this.jobs.set(jobId, job);
    this.cleanup();
    return cloneJob(job);
  }

  getById(id: string): JobEntity | undefined {
    const job = this.jobs.get(id);
    return job === undefined ? undefined : cloneJob(job);
  }

  list(query: JobListQuery): { items: JobEntity[]; total: number } {
    const filtered = [...this.jobs.values()].filter((job) =>
      query.status === undefined ? true : job.status === query.status,
    );

    filtered.sort((left, right) => {
      if (left.createdAt === right.createdAt) {
        return right.id.localeCompare(left.id);
      }
      return right.createdAt.localeCompare(left.createdAt);
    });

    const total = filtered.length;
    const items = filtered
      .slice(query.offset, query.offset + query.limit)
      .map((job) => cloneJob(job));

    return { items, total };
  }

  markInProgress(id: string): UrlItemEntity[] {
    const job = this.requireJob(id);
    assertJobTransition(job.status, 'running');
    job.status = 'running';
    job.startedAt = this.nowIso();
    this.bumpVersion(job);
    return cloneUrlItems(job.items.filter((item) => item.status === 'pending'));
  }

  startUrl(jobId: string, urlId: string): void {
    const job = this.requireMutableJob(jobId);
    const item = this.requireUrl(job, urlId);
    assertUrlTransition(item.status, 'running');
    item.status = 'running';
    item.startedAt = this.nowIso();
    this.bumpVersion(job);
  }

  setUrlResult(
    jobId: string,
    urlId: string,
    outcome: CheckOutcome,
    delayMs: number,
  ): void {
    const job = this.requireMutableJob(jobId);
    const item = this.requireUrl(job, urlId);

    if (isTerminalUrlStatus(item.status)) {
      return;
    }

    const finishedAt = this.nowIso();
    item.delayMs = delayMs;

    switch (outcome.kind) {
      case 'success': {
        assertUrlTransition(item.status, 'done');
        item.status = 'done';
        item.httpStatusCode = outcome.httpStatus;
        item.finalUrl = outcome.finalUrl;
        item.redirected = outcome.redirected;
        item.httpDurationMs = outcome.httpDurationMs;
        item.errorCode = null;
        item.errorMessage = null;
        item.finishedAt = finishedAt;
        break;
      }
      case 'http_error': {
        assertUrlTransition(item.status, 'error');
        item.status = 'error';
        item.httpStatusCode = outcome.httpStatus;
        item.finalUrl = outcome.finalUrl;
        item.redirected = outcome.redirected;
        item.httpDurationMs = outcome.httpDurationMs;
        item.errorCode = outcome.errorCode;
        item.errorMessage = outcome.errorMessage;
        item.finishedAt = finishedAt;
        break;
      }
      case 'error': {
        assertUrlTransition(item.status, 'error');
        item.status = 'error';
        item.httpStatusCode = null;
        item.finalUrl = null;
        item.redirected = false;
        item.httpDurationMs = outcome.httpDurationMs;
        item.errorCode = outcome.errorCode;
        item.errorMessage = outcome.errorMessage;
        item.finishedAt = finishedAt;
        break;
      }
      case 'aborted': {
        assertUrlTransition(item.status, 'cancelled');
        item.status = 'cancelled';
        item.finishedAt = finishedAt;
        break;
      }
    }

    this.bumpVersion(job);
  }

  cancelUrl(jobId: string, urlId: string): void {
    const job = this.requireMutableJob(jobId);
    const item = this.requireUrl(job, urlId);

    if (isTerminalUrlStatus(item.status)) {
      return;
    }

    assertUrlTransition(item.status, 'cancelled');
    item.status = 'cancelled';
    item.finishedAt = this.nowIso();
    this.bumpVersion(job);
  }

  requestCancel(id: string): { cancelledUrls: number } {
    const job = this.requireMutableJob(id);
    let cancelledUrls = 0;
    const finishedAt = this.nowIso();

    for (const item of job.items) {
      if (isTerminalUrlStatus(item.status)) {
        continue;
      }

      assertUrlTransition(item.status, 'cancelled');
      item.status = 'cancelled';
      item.finishedAt = finishedAt;
      cancelledUrls += 1;
    }

    this.bumpVersion(job);
    return { cancelledUrls };
  }

  finalize(id: string): void {
    const job = this.requireJob(id);

    if (isTerminalJobStatus(job.status)) {
      throw new InvalidTransitionError('job', job.status, job.status);
    }

    if (!areAllUrlsTerminal(job.items)) {
      throw new Error(`Cannot finalize job ${id}: URLs are still active`);
    }

    const nextStatus: JobStatus = hasCancelledUrl(job.items)
      ? 'cancelled'
      : 'completed';

    assertJobTransition(job.status, nextStatus);
    job.status = nextStatus;
    job.finishedAt = this.nowIso();
    this.bumpVersion(job);
  }

  fail(id: string, error: string): void {
    const job = this.requireJob(id);
    assertJobTransition(job.status, 'failed');
    job.status = 'failed';
    job.errorMessage = error;
    job.finishedAt = this.nowIso();
    this.bumpVersion(job);
  }

  toSummary = toSummary;
  toDetail = toDetail;

  cleanup(): void {
    const nowMs = this.clock.now().getTime();
    const ttlCutoff = nowMs - this.jobTtlMs;

    for (const [id, job] of this.jobs) {
      if (!isTerminalJobStatus(job.status)) {
        continue;
      }

      const finishedAtMs = Date.parse(job.finishedAt ?? job.createdAt);
      if (Number.isFinite(finishedAtMs) && finishedAtMs <= ttlCutoff) {
        this.jobs.delete(id);
      }
    }

    if (this.jobs.size <= this.maxJobs) {
      return;
    }

    const terminalJobs = [...this.jobs.values()]
      .filter((job) => isTerminalJobStatus(job.status))
      .sort((left, right) => {
        const leftTime = left.finishedAt ?? left.createdAt;
        const rightTime = right.finishedAt ?? right.createdAt;
        if (leftTime === rightTime) {
          return left.id.localeCompare(right.id);
        }
        return leftTime.localeCompare(rightTime);
      });

    let overflow = this.jobs.size - this.maxJobs;
    for (const job of terminalJobs) {
      if (overflow <= 0) {
        break;
      }
      this.jobs.delete(job.id);
      overflow -= 1;
    }
  }

  /** Test helper: current in-memory size. */
  size(): number {
    return this.jobs.size;
  }

  private requireJob(id: string): JobEntity {
    const job = this.jobs.get(id);
    if (job === undefined) {
      throw new Error(`Job not found: ${id}`);
    }
    return job;
  }

  private requireMutableJob(id: string): JobEntity {
    const job = this.requireJob(id);
    assertJobMutable(job.status);
    return job;
  }

  private requireUrl(job: JobEntity, urlId: string): UrlItemEntity {
    const item = job.items.find((candidate) => candidate.id === urlId);
    if (item === undefined) {
      throw new Error(`URL item not found: ${urlId}`);
    }
    return item;
  }

  private bumpVersion(job: JobEntity): void {
    job.version += 1;
  }

  private nowIso(): string {
    return this.clock.now().toISOString();
  }
}
