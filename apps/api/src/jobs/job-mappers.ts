import type { JobDetail, JobSummary, UrlResult } from '@repo/shared';

import type { JobEntity, UrlItemEntity } from './job.entity';
import { computeJobStats } from './job-stats';

function resolveUpdatedAt(job: JobEntity): string {
  return job.finishedAt ?? job.startedAt ?? job.createdAt;
}

function toUrlResult(item: UrlItemEntity): UrlResult {
  return {
    url: item.url,
    status: item.status,
    httpStatusCode: item.httpStatusCode,
    errorMessage: item.errorMessage,
    checkedAt: item.finishedAt,
  };
}

export function toSummary(job: JobEntity): JobSummary {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: resolveUpdatedAt(job),
    stats: computeJobStats(job.items),
  };
}

export function toDetail(job: JobEntity): JobDetail {
  return {
    ...toSummary(job),
    results: job.items.map(toUrlResult),
  };
}

export function cloneJob(job: JobEntity): JobEntity {
  return structuredClone(job);
}

export function cloneUrlItems(items: readonly UrlItemEntity[]): UrlItemEntity[] {
  return structuredClone(items) as UrlItemEntity[];
}
