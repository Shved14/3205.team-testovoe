import type { JobStatus, UrlStatus } from '@repo/shared';

import { InvalidTransitionError } from './invalid-transition.error';

export const TERMINAL_JOB_STATUSES = new Set<JobStatus>([
  'completed',
  'cancelled',
  'failed',
]);

export const TERMINAL_URL_STATUSES = new Set<UrlStatus>([
  'done',
  'error',
  'cancelled',
]);

const JOB_TRANSITIONS: Record<JobStatus, ReadonlySet<JobStatus>> = {
  pending: new Set(['running', 'cancelled', 'failed']),
  running: new Set(['completed', 'cancelled', 'failed']),
  completed: new Set(),
  cancelled: new Set(),
  failed: new Set(),
};

const URL_TRANSITIONS: Record<UrlStatus, ReadonlySet<UrlStatus>> = {
  pending: new Set(['running', 'cancelled']),
  running: new Set(['done', 'error', 'cancelled']),
  done: new Set(),
  error: new Set(),
  cancelled: new Set(),
};

export function isTerminalJobStatus(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.has(status);
}

export function isTerminalUrlStatus(status: UrlStatus): boolean {
  return TERMINAL_URL_STATUSES.has(status);
}

export function assertJobTransition(from: JobStatus, to: JobStatus): void {
  const allowed = JOB_TRANSITIONS[from];
  if (!allowed.has(to)) {
    throw new InvalidTransitionError('job', from, to);
  }
}

export function assertUrlTransition(from: UrlStatus, to: UrlStatus): void {
  const allowed = URL_TRANSITIONS[from];
  if (!allowed.has(to)) {
    throw new InvalidTransitionError('url', from, to);
  }
}

export function assertJobMutable(status: JobStatus): void {
  if (isTerminalJobStatus(status)) {
    throw new InvalidTransitionError('job', status, status);
  }
}
