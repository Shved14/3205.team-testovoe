import { API_ERROR_CODES } from '@repo/shared';

export class JobNotFoundError extends Error {
  readonly code = API_ERROR_CODES.JOB_NOT_FOUND;
  readonly jobId: string;

  constructor(jobId: string) {
    super(`Job not found: ${jobId}`);
    this.name = 'JobNotFoundError';
    this.jobId = jobId;
  }
}

export class JobAlreadyFinishedError extends Error {
  readonly code = API_ERROR_CODES.JOB_ALREADY_FINISHED;
  readonly jobId: string;
  readonly status: string;

  constructor(jobId: string, status: string) {
    super(`Job already finished: ${jobId} (${status})`);
    this.name = 'JobAlreadyFinishedError';
    this.jobId = jobId;
    this.status = status;
  }
}
