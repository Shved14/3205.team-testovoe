import type { JobDetail, JobStatus } from '@repo/shared';

import {
  hasNonTerminalJobs,
  isTerminalJobStatus,
  type JobsStore,
} from './jobs-store';

export function selectActiveDetail(state: JobsStore): JobDetail | undefined {
  if (state.activeJobId === null) {
    return undefined;
  }
  return state.detailsById[state.activeJobId];
}

export function selectIsTerminalStatus(status: JobStatus): boolean {
  return isTerminalJobStatus(status);
}

export function selectHasActiveJobs(state: JobsStore): boolean {
  return hasNonTerminalJobs(state.jobs);
}

export function selectProgress(
  state: JobsStore,
): { processed: number; total: number } | null {
  const detail = selectActiveDetail(state);
  if (detail === undefined) {
    return null;
  }

  const { total, completed, failed } = detail.stats;
  const cancelled = detail.results.filter((item) => item.status === 'cancelled').length;
  const processed = completed + failed + cancelled;

  return { processed, total };
}

export { isTerminalJobStatus, hasNonTerminalJobs };
