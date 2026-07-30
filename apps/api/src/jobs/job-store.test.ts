import { afterEach, describe, expect, it } from 'vitest';

import type { Clock } from '../common/clock';
import { InvalidTransitionError } from './invalid-transition.error';
import { computeJobStats } from './job-stats';
import { JobStore } from './job-store';
import type { UrlItemEntity } from './job.entity';
import { toDetail, toSummary } from './job-mappers';

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

  advance(ms: number): void {
    this.currentMs += ms;
  }
}

function createStore(clock: FakeClock, overrides: Partial<ConstructorParameters<typeof JobStore>[0]> = {}): JobStore {
  return new JobStore({
    clock,
    startCleanupScheduler: false,
    createId: (() => {
      let sequence = 0;
      return () => {
        sequence += 1;
        return `id-${sequence}`;
      };
    })(),
    ...overrides,
  });
}

function item(status: UrlItemEntity['status']): UrlItemEntity {
  return {
    id: 'u',
    url: 'https://example.com',
    status,
    httpStatusCode: null,
    errorCode: null,
    errorMessage: null,
    finalUrl: null,
    redirected: false,
    delayMs: null,
    httpDurationMs: null,
    startedAt: null,
    finishedAt: null,
  };
}

describe('JobStore', () => {
  let store: JobStore;

  afterEach(() => {
    store?.dispose();
  });

  describe('forbidden job transitions', () => {
    it('rejects markInProgress from running/completed/cancelled/failed', () => {
      const clock = new FakeClock(Date.parse('2026-01-01T00:00:00.000Z'));
      store = createStore(clock);

      const created = store.create(['https://a.example']);
      store.markInProgress(created.id);
      expect(() => store.markInProgress(created.id)).toThrow(InvalidTransitionError);

      const completed = store.create(['https://b.example']);
      const completedItems = store.markInProgress(completed.id);
      store.startUrl(completed.id, completedItems[0]!.id);
      store.setUrlResult(
        completed.id,
        completedItems[0]!.id,
        {
          kind: 'success',
          httpStatus: 200,
          finalUrl: 'https://b.example',
          redirected: false,
          httpDurationMs: 10,
        },
        1,
      );
      store.finalize(completed.id);
      expect(() => store.markInProgress(completed.id)).toThrow(InvalidTransitionError);

      const cancelled = store.create(['https://c.example']);
      store.requestCancel(cancelled.id);
      store.finalize(cancelled.id);
      expect(() => store.markInProgress(cancelled.id)).toThrow(InvalidTransitionError);

      const failed = store.create(['https://d.example']);
      store.fail(failed.id, 'boom');
      expect(() => store.markInProgress(failed.id)).toThrow(InvalidTransitionError);
    });

    it('rejects finalize and fail from terminal statuses', () => {
      const clock = new FakeClock(Date.parse('2026-01-01T00:00:00.000Z'));
      store = createStore(clock);

      for (const terminalSetup of [
        (s: JobStore) => {
          const job = s.create(['https://done.example']);
          s.requestCancel(job.id);
          s.finalize(job.id);
          return job.id;
        },
        (s: JobStore) => {
          const job = s.create(['https://fail.example']);
          s.fail(job.id, 'x');
          return job.id;
        },
        (s: JobStore) => {
          const job = s.create(['https://complete.example']);
          const urls = s.markInProgress(job.id);
          s.startUrl(job.id, urls[0]!.id);
          s.setUrlResult(
            job.id,
            urls[0]!.id,
            {
              kind: 'success',
              httpStatus: 200,
              finalUrl: 'https://complete.example',
              redirected: false,
              httpDurationMs: 1,
            },
            0,
          );
          s.finalize(job.id);
          return job.id;
        },
      ]) {
        const id = terminalSetup(store);
        expect(() => store.finalize(id)).toThrow(InvalidTransitionError);
        expect(() => store.fail(id, 'again')).toThrow(InvalidTransitionError);
        expect(() => store.requestCancel(id)).toThrow(InvalidTransitionError);
      }
    });

    it('rejects pending -> completed when URLs are not ready is not via transition table misuse', () => {
      const clock = new FakeClock(Date.parse('2026-01-01T00:00:00.000Z'));
      store = createStore(clock);
      const job = store.create(['https://example.com']);
      expect(() => store.finalize(job.id)).toThrow(/still active/);
    });
  });

  describe('URL terminal immutability', () => {
    it('does not overwrite a terminal URL result (cancel race)', () => {
      const clock = new FakeClock(Date.parse('2026-01-01T00:00:00.000Z'));
      store = createStore(clock);
      const job = store.create(['https://example.com']);
      const urls = store.markInProgress(job.id);
      const urlId = urls[0]!.id;

      store.startUrl(job.id, urlId);
      store.cancelUrl(job.id, urlId);

      const versionAfterCancel = store.getById(job.id)!.version;

      store.setUrlResult(
        job.id,
        urlId,
        {
          kind: 'success',
          httpStatus: 200,
          finalUrl: 'https://example.com',
          redirected: false,
          httpDurationMs: 5,
        },
        10,
      );

      const after = store.getById(job.id)!;
      expect(after.items[0]!.status).toBe('cancelled');
      expect(after.items[0]!.httpStatusCode).toBeNull();
      expect(after.version).toBe(versionAfterCancel);
    });
  });

  describe('version and mappers', () => {
    it('increments version on each mutation and mappers do not leak internal refs', () => {
      const clock = new FakeClock(Date.parse('2026-01-01T00:00:00.000Z'));
      store = createStore(clock);
      const created = store.create(['https://example.com/a', 'https://example.com/b']);
      expect(created.version).toBe(1);

      const pendingUrls = store.markInProgress(created.id);
      let current = store.getById(created.id)!;
      expect(current.version).toBe(2);

      store.startUrl(created.id, pendingUrls[0]!.id);
      current = store.getById(created.id)!;
      expect(current.version).toBe(3);

      const summary = toSummary(current);
      const detail = toDetail(current);
      summary.stats.total = 999;
      detail.results[0]!.url = 'mutated';

      const reread = store.getById(created.id)!;
      expect(reread.items[0]!.url).toBe('https://example.com/a');
      expect(toSummary(reread).stats.total).toBe(2);
    });
  });

  describe('derived stats', () => {
    it('computes stats for all status combinations', () => {
      expect(computeJobStats([])).toEqual({
        total: 0,
        completed: 0,
        failed: 0,
        pending: 0,
      });

      expect(computeJobStats([item('pending'), item('pending')])).toEqual({
        total: 2,
        completed: 0,
        failed: 0,
        pending: 2,
      });

      expect(computeJobStats([item('running'), item('pending')])).toEqual({
        total: 2,
        completed: 0,
        failed: 0,
        pending: 2,
      });

      expect(computeJobStats([item('done'), item('done')])).toEqual({
        total: 2,
        completed: 2,
        failed: 0,
        pending: 0,
      });

      expect(computeJobStats([item('error'), item('error')])).toEqual({
        total: 2,
        completed: 0,
        failed: 2,
        pending: 0,
      });

      expect(computeJobStats([item('cancelled'), item('cancelled')])).toEqual({
        total: 2,
        completed: 0,
        failed: 0,
        pending: 0,
      });

      expect(
        computeJobStats([
          item('pending'),
          item('running'),
          item('done'),
          item('error'),
          item('cancelled'),
        ]),
      ).toEqual({
        total: 5,
        completed: 1,
        failed: 1,
        pending: 2,
      });
    });
  });

  describe('cleanup eviction', () => {
    it('removes terminal jobs older than TTL and never removes active jobs', () => {
      const clock = new FakeClock(Date.parse('2026-01-01T00:00:00.000Z'));
      store = createStore(clock, { jobTtlMs: 1_000, maxJobs: 100 });

      const oldTerminal = store.create(['https://old.example']);
      store.fail(oldTerminal.id, 'x');

      const active = store.create(['https://active.example']);
      store.markInProgress(active.id);

      clock.advance(1_001);
      const freshTerminal = store.create(['https://fresh.example']);
      store.fail(freshTerminal.id, 'y');

      store.cleanup();

      expect(store.getById(oldTerminal.id)).toBeUndefined();
      expect(store.getById(active.id)?.status).toBe('running');
      expect(store.getById(freshTerminal.id)?.status).toBe('failed');
    });

    it('evicts oldest terminal jobs when MAX_JOBS is exceeded', () => {
      const clock = new FakeClock(Date.parse('2026-01-01T00:00:00.000Z'));
      store = createStore(clock, { jobTtlMs: 60_000, maxJobs: 2 });

      const first = store.create(['https://1.example']);
      store.fail(first.id, 'a');

      clock.advance(10);
      const second = store.create(['https://2.example']);
      store.fail(second.id, 'b');

      clock.advance(10);
      const active = store.create(['https://active.example']);
      store.markInProgress(active.id);

      clock.advance(10);
      const third = store.create(['https://3.example']);
      store.fail(third.id, 'c');

      expect(store.size()).toBeLessThanOrEqual(2);
      expect(store.getById(active.id)?.status).toBe('running');
      expect(store.getById(first.id)).toBeUndefined();
    });
  });

  describe('finalize decision', () => {
    it('finalizes to completed or cancelled based on URL statuses', () => {
      const clock = new FakeClock(Date.parse('2026-01-01T00:00:00.000Z'));
      store = createStore(clock);

      const completedJob = store.create(['https://ok.example']);
      const completedUrls = store.markInProgress(completedJob.id);
      store.startUrl(completedJob.id, completedUrls[0]!.id);
      store.setUrlResult(
        completedJob.id,
        completedUrls[0]!.id,
        {
          kind: 'http_error',
          httpStatus: 404,
          finalUrl: 'https://ok.example',
          redirected: false,
          errorCode: 'HTTP_ERROR',
          errorMessage: 'HTTP 404 Not Found',
          httpDurationMs: 2,
        },
        0,
      );
      store.finalize(completedJob.id);
      expect(store.getById(completedJob.id)?.status).toBe('completed');

      const cancelledJob = store.create(['https://cancel.example']);
      store.markInProgress(cancelledJob.id);
      store.requestCancel(cancelledJob.id);
      store.finalize(cancelledJob.id);
      expect(store.getById(cancelledJob.id)?.status).toBe('cancelled');
    });
  });

  describe('list sorting', () => {
    it('returns jobs sorted by createdAt DESC', () => {
      const clock = new FakeClock(Date.parse('2026-01-01T00:00:00.000Z'));
      store = createStore(clock);

      const older = store.create(['https://old.example']);
      clock.advance(1000);
      const newer = store.create(['https://new.example']);

      const listed = store.list({ limit: 10, offset: 0 });
      expect(listed.total).toBe(2);
      expect(listed.items.map((job) => job.id)).toEqual([newer.id, older.id]);
    });
  });
});
