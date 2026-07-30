import type { JobStats } from '@repo/shared';

import type { UrlItemEntity } from './job.entity';
import { isTerminalUrlStatus } from './job-transitions';

export function computeJobStats(items: readonly UrlItemEntity[]): JobStats {
  let completed = 0;
  let failed = 0;
  let pending = 0;

  for (const item of items) {
    switch (item.status) {
      case 'done':
        completed += 1;
        break;
      case 'error':
        failed += 1;
        break;
      case 'pending':
      case 'running':
        pending += 1;
        break;
      case 'cancelled':
        break;
    }
  }

  return {
    total: items.length,
    completed,
    failed,
    pending,
  };
}

export function areAllUrlsTerminal(items: readonly UrlItemEntity[]): boolean {
  return items.every((item) => isTerminalUrlStatus(item.status));
}

export function hasCancelledUrl(items: readonly UrlItemEntity[]): boolean {
  return items.some((item) => item.status === 'cancelled');
}
