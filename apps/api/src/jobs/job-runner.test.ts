import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CheckOutcome, UrlChecker } from '../checker/url-checker';
import type { Clock } from '../common/clock';
import type { RandomService } from '../common/random.service';
import type { SleepService } from '../common/sleep.service';
import { SilentLogger } from './app-logger';
import { computeJobStats } from './job-stats';
import { JobRunner } from './job-runner';
import { JobRuntimeRegistry } from './job-runtime-registry';
import { JobStore } from './job-store';
import type { JobsConfig } from './jobs-config';
import { toSummary } from './job-mappers';

class FakeClock implements Clock {
  private currentMs: number;

  constructor(startMs: number) {
    this.currentMs = startMs;
  }

  now(): Date {
    return new Date(this.currentMs);
  }

  monotonicMs(): number {
    return this.currentMs;
  }
}

function createSuccessOutcome(url: string): CheckOutcome {
  return {
    kind: 'success',
    httpStatus: 200,
    finalUrl: url,
    redirected: false,
    httpDurationMs: 1,
  };
}

function createRunner(options: {
  store: JobStore;
  checker: UrlChecker;
  sleep?: SleepService;
  random?: RandomService;
  config?: Partial<JobsConfig>;
  registry?: JobRuntimeRegistry;
  clock?: Clock;
}): { runner: JobRunner; registry: JobRuntimeRegistry } {
  const registry = options.registry ?? new JobRuntimeRegistry();
  const runner = new JobRunner({
    store: options.store,
    checker: options.checker,
    sleep: options.sleep ?? {
      wait: async () => true,
    },
    random: options.random ?? {
      intBetween: () => 0,
    },
    clock: options.clock ?? new FakeClock(Date.parse('2026-01-01T00:00:00.000Z')),
    config: {
      perJobConcurrency: 5,
      maxArtificialDelayMs: 0,
      cancelStrategy: 'abort',
      ...options.config,
    },
    logger: new SilentLogger(),
    registry,
  });

  return { runner, registry };
}

describe('JobRunner', () => {
  let store: JobStore;

  afterEach(() => {
    store?.dispose();
  });

  it('happy path: 12 URLs succeed and job completes with correct stats', async () => {
    const clock = new FakeClock(Date.parse('2026-01-01T00:00:00.000Z'));
    store = new JobStore({ clock, startCleanupScheduler: false });
    const urls = Array.from({ length: 12 }, (_, index) => `https://example.com/${index}`);
    const job = store.create(urls);

    const checker: UrlChecker = {
      check: vi.fn(async (url: string) => createSuccessOutcome(url)),
    };

    const { runner, registry } = createRunner({ store, checker, clock });
    await runner.start(job.id);

    const finished = store.getById(job.id)!;
    expect(finished.status).toBe('completed');
    expect(toSummary(finished).stats).toEqual({
      total: 12,
      completed: 12,
      failed: 0,
      pending: 0,
    });
    expect(finished.items.every((item) => item.status === 'done')).toBe(true);
    expect(registry.size()).toBe(0);
    expect(checker.check).toHaveBeenCalledTimes(12);
  });

  it('cancel before start: all URLs cancelled and job cancelled', async () => {
    const clock = new FakeClock(Date.parse('2026-01-01T00:00:00.000Z'));
    store = new JobStore({ clock, startCleanupScheduler: false });
    const job = store.create([
      'https://example.com/1',
      'https://example.com/2',
      'https://example.com/3',
    ]);

    const checker: UrlChecker = {
      check: vi.fn(async (url: string) => createSuccessOutcome(url)),
    };

    const { runner } = createRunner({ store, checker, clock });
    runner.cancel(job.id);

    const finished = store.getById(job.id)!;
    expect(finished.status).toBe('cancelled');
    expect(finished.items.every((item) => item.status === 'cancelled')).toBe(true);
    expect(checker.check).not.toHaveBeenCalled();
  });

  it('cancel in flight: working URLs become cancelled and no results are written after cancel', async () => {
    const clock = new FakeClock(Date.parse('2026-01-01T00:00:00.000Z'));
    store = new JobStore({ clock, startCleanupScheduler: false });
    const urls = Array.from({ length: 10 }, (_, index) => `https://example.com/${index}`);
    const job = store.create(urls);

    let releaseCheck: (() => void) | undefined;
    const checkGate = new Promise<void>((resolve) => {
      releaseCheck = resolve;
    });

    const checker: UrlChecker = {
      check: vi.fn(async (url: string, signal: AbortSignal) => {
        await checkGate;
        if (signal.aborted) {
          return { kind: 'aborted' };
        }
        return createSuccessOutcome(url);
      }),
    };

    const { runner } = createRunner({
      store,
      checker,
      clock,
      config: { perJobConcurrency: 5, cancelStrategy: 'abort' },
    });

    const started = runner.start(job.id);
    await vi.waitFor(() => {
      expect(checker.check).toHaveBeenCalled();
    });

    runner.cancel(job.id);
    releaseCheck?.();
    await started;

    const finished = store.getById(job.id)!;
    expect(finished.status).toBe('cancelled');
    expect(finished.items.every((item) => item.status === 'cancelled')).toBe(true);
    expect(finished.items.every((item) => item.httpStatusCode === null)).toBe(true);
  });

  it('checker throw becomes URL INTERNAL_ERROR and job still completes', async () => {
    const clock = new FakeClock(Date.parse('2026-01-01T00:00:00.000Z'));
    store = new JobStore({ clock, startCleanupScheduler: false });
    const job = store.create(['https://ok.example', 'https://boom.example']);

    const checker: UrlChecker = {
      check: vi.fn(async (url: string) => {
        if (url.includes('boom')) {
          throw new Error('checker exploded');
        }
        return createSuccessOutcome(url);
      }),
    };

    const { runner } = createRunner({ store, checker, clock });
    await runner.start(job.id);

    const finished = store.getById(job.id)!;
    expect(finished.status).toBe('completed');
    expect(finished.items.find((item) => item.url.includes('ok'))?.status).toBe('done');
    const failed = finished.items.find((item) => item.url.includes('boom'))!;
    expect(failed.status).toBe('error');
    expect(failed.errorCode).toBe('INTERNAL_ERROR');
    expect(failed.errorMessage).toBe('checker exploded');
    expect(computeJobStats(finished.items)).toEqual({
      total: 2,
      completed: 1,
      failed: 1,
      pending: 0,
    });
  });

  it('runs 3 jobs with independent concurrency limit of 5', async () => {
    const clock = new FakeClock(Date.parse('2026-01-01T00:00:00.000Z'));
    store = new JobStore({ clock, startCleanupScheduler: false });

    const peaks = new Map<string, number>();
    const inFlight = new Map<string, number>();

    const checker: UrlChecker = {
      check: vi.fn(async (url: string) => {
        const jobKey = url.match(/\/job\/(\d+)\//)?.[1] ?? 'unknown';
        inFlight.set(jobKey, (inFlight.get(jobKey) ?? 0) + 1);
        peaks.set(jobKey, Math.max(peaks.get(jobKey) ?? 0, inFlight.get(jobKey) ?? 0));
        await Promise.resolve();
        inFlight.set(jobKey, (inFlight.get(jobKey) ?? 1) - 1);
        return createSuccessOutcome(url);
      }),
    };

    const { runner } = createRunner({
      store,
      checker,
      clock,
      config: { perJobConcurrency: 5, maxArtificialDelayMs: 0, cancelStrategy: 'abort' },
    });

    const jobs = [0, 1, 2].map((jobIndex) => {
      const urls = Array.from(
        { length: 12 },
        (_, urlIndex) => `https://example.com/job/${jobIndex}/${urlIndex}`,
      );
      return store.create(urls);
    });

    await Promise.all(jobs.map((job) => runner.start(job.id)));

    for (const job of jobs) {
      const finished = store.getById(job.id)!;
      expect(finished.status).toBe('completed');
    }

    expect(peaks.get('0')).toBe(5);
    expect(peaks.get('1')).toBe(5);
    expect(peaks.get('2')).toBe(5);
  });
});
