import type {
  CancelJobResponse,
  CreateJobResponse,
  JobDetail,
  JobListResponse,
  ListJobsQuery,
} from '@repo/shared';
import {
  cancelJobResponseSchema,
  createJobResponseSchema,
  jobDetailSchema,
  jobListResponseSchema,
} from '@repo/shared';

import { requestJson } from './httpClient';

export function createJob(
  urls: string[],
  signal?: AbortSignal,
): Promise<CreateJobResponse> {
  return requestJson('/api/jobs', {
    method: 'POST',
    body: { urls },
    schema: createJobResponseSchema,
    ...(signal !== undefined ? { signal } : {}),
  });
}

export function getJobs(
  params: ListJobsQuery,
  signal?: AbortSignal,
): Promise<JobListResponse> {
  const search = new URLSearchParams();
  search.set('limit', String(params.limit));
  search.set('offset', String(params.offset));
  if (params.status !== undefined) {
    search.set('status', params.status);
  }

  return requestJson(`/api/jobs?${search.toString()}`, {
    method: 'GET',
    schema: jobListResponseSchema,
    ...(signal !== undefined ? { signal } : {}),
  });
}

export function getJob(id: string, signal?: AbortSignal): Promise<JobDetail> {
  return requestJson(`/api/jobs/${encodeURIComponent(id)}`, {
    method: 'GET',
    schema: jobDetailSchema,
    ...(signal !== undefined ? { signal } : {}),
  });
}

export function cancelJob(
  id: string,
  signal?: AbortSignal,
): Promise<CancelJobResponse> {
  return requestJson(`/api/jobs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    schema: cancelJobResponseSchema,
    ...(signal !== undefined ? { signal } : {}),
  });
}
