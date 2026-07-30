import type { JobStatus, UrlStatus } from '@repo/shared';

export type UrlItemEntity = {
  id: string;
  url: string;
  status: UrlStatus;
  httpStatusCode: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  finalUrl: string | null;
  redirected: boolean;
  delayMs: number | null;
  httpDurationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type JobEntity = {
  id: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  status: JobStatus;
  version: number;
  items: UrlItemEntity[];
  errorMessage: string | null;
};

export type JobListQuery = {
  limit: number;
  offset: number;
  status?: JobStatus;
};
