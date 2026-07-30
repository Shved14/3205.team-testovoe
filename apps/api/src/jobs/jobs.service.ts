import type {
  CreateJobRequest,
  JobDetail,
  JobListResponse,
  JobStatus,
  ListJobsQuery,
} from '@repo/shared';

import type { AppLogger } from './app-logger';
import { JobAlreadyFinishedError, JobNotFoundError } from './job-errors';
import type { JobRunner } from './job-runner';
import { toDetail, toSummary } from './job-mappers';
import type { JobStore } from './job-store';
import { isTerminalJobStatus } from './job-transitions';

export type CancelJobResult = {
  jobId: string;
  status: JobStatus;
  cancelledUrls: number;
};

export type JobsServiceDependencies = {
  store: JobStore;
  runner: JobRunner;
  logger: AppLogger;
};

export class JobsService {
  private readonly store: JobStore;
  private readonly runner: JobRunner;
  private readonly logger: AppLogger;

  constructor(dependencies: JobsServiceDependencies) {
    this.store = dependencies.store;
    this.runner = dependencies.runner;
    this.logger = dependencies.logger;
  }

  createJob(request: CreateJobRequest): { jobId: string } {
    const job = this.store.create(request.urls);
    void this.runner.start(job.id).catch((error: unknown) => {
      this.logger.error('Failed to run job', {
        jobId: job.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
    return { jobId: job.id };
  }

  listJobs(query: ListJobsQuery): JobListResponse {
    const listed = this.store.list({
      limit: query.limit,
      offset: query.offset,
      ...(query.status !== undefined ? { status: query.status } : {}),
    });

    return {
      items: listed.items.map((job) => toSummary(job)),
      total: listed.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  getJob(id: string): { detail: JobDetail; version: number } {
    const job = this.store.getById(id);
    if (job === undefined) {
      throw new JobNotFoundError(id);
    }

    return {
      detail: toDetail(job),
      version: job.version,
    };
  }

  cancelJob(id: string): CancelJobResult {
    const job = this.store.getById(id);
    if (job === undefined) {
      throw new JobNotFoundError(id);
    }

    if (isTerminalJobStatus(job.status)) {
      throw new JobAlreadyFinishedError(id, job.status);
    }

    const { cancelledUrls } = this.runner.cancel(id);
    const after = this.store.getById(id);
    if (after === undefined) {
      throw new JobNotFoundError(id);
    }

    return {
      jobId: after.id,
      status: after.status,
      cancelledUrls,
    };
  }

  getHealth(uptimeMs: number): {
    status: 'ok';
    uptimeMs: number;
    jobs: { total: number; active: number };
  } {
    return {
      status: 'ok',
      uptimeMs,
      jobs: {
        total: this.store.size(),
        active: this.store.countActive(),
      },
    };
  }
}
