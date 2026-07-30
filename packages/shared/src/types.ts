import type { ApiErrorCode } from './errors';

export const JOB_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const URL_STATUSES = [
  'pending',
  'running',
  'done',
  'error',
  'cancelled',
] as const;

export type UrlStatus = (typeof URL_STATUSES)[number];

export type JobStats = {
  total: number;
  completed: number;
  failed: number;
  pending: number;
};

export type JobSummary = {
  id: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  stats: JobStats;
};

export type UrlResult = {
  url: string;
  status: UrlStatus;
  httpStatusCode: number | null;
  errorMessage: string | null;
  checkedAt: string | null;
};

export type JobDetail = JobSummary & {
  results: UrlResult[];
};

export type CreateJobResponse = {
  id: string;
};

export type JobListResponse = {
  items: JobSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type CancelJobResponse = {
  id: string;
  status: JobStatus;
};

export type ApiErrorBody = {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
};
