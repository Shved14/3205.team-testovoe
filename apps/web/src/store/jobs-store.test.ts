import type { JobDetail, JobSummary } from '@repo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PollController } from '../polling/poll-controller';
import { createJobsStore, type JobsApiPort } from './jobs-store';

function summary(id: string, status: JobSummary['status'] = 'running'): JobSummary {
  return {
    id,
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    stats: { total: 1, completed: 0, failed: 0, pending: 1 },
  };
}

function detail(
  id: string,
  status: JobDetail['status'] = 'running',
): JobDetail {
  return {
    ...summary(id, status),
    results: [
      {
        url: `https://example.com/${id}`,
        status: status === 'completed' ? 'done' : 'pending',
        httpStatusCode: status === 'completed' ? 200 : null,
        errorMessage: null,
        checkedAt: status === 'completed' ? '2026-01-01T00:00:01.000Z' : null,
      },
    ],
    stats:
      status === 'completed'
        ? { total: 1, completed: 1, failed: 0, pending: 0 }
        : { total: 1, completed: 0, failed: 0, pending: 1 },
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('jobs store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores a late getJob(A) after switching to B (no detailsById[A])', async () => {
    let releaseA: (() => void) | undefined;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });

    const api: JobsApiPort = {
      createJob: vi.fn(),
      getJobs: vi.fn(async () => ({
        items: [summary('A'), summary('B')],
        total: 2,
        limit: 20,
        offset: 0,
      })),
      cancelJob: vi.fn(),
      getJob: vi.fn(async (id: string) => {
        if (id === 'A') {
          await gateA;
          return detail('A', 'running');
        }
        return detail('B', 'running');
      }),
    };

    const detailPoller = new PollController({ intervalMs: 1000 });
    const store = createJobsStore({ api, detailPoller });

    store.getState().setActiveJob('A');
    await vi.advanceTimersByTimeAsync(0);
    await flushMicrotasks();

    store.getState().setActiveJob('B');
    await vi.advanceTimersByTimeAsync(0);
    await flushMicrotasks();

    releaseA?.();
    await flushMicrotasks();

    const state = store.getState();
    expect(state.activeJobId).toBe('B');
    expect(state.detailsById['A']).toBeUndefined();
    expect(state.detailsById['B']).toEqual(detail('B', 'running'));
  });

  it('switching active job stops the previous detail poller', async () => {
    const api: JobsApiPort = {
      createJob: vi.fn(),
      getJobs: vi.fn(async () => ({ items: [], total: 0, limit: 20, offset: 0 })),
      cancelJob: vi.fn(),
      getJob: vi.fn(async (id: string) => detail(id, 'running')),
    };

    const detailPoller = new PollController({ intervalMs: 1000 });
    const stopSpy = vi.spyOn(detailPoller, 'stop');
    const store = createJobsStore({ api, detailPoller });

    store.getState().setActiveJob('A');
    expect(stopSpy).toHaveBeenCalledTimes(1);

    store.getState().setActiveJob('B');
    expect(stopSpy).toHaveBeenCalledTimes(2);
  });

  it('createJob makes the new job active and stops previous polling', async () => {
    const api: JobsApiPort = {
      createJob: vi.fn(async () => ({ jobId: 'new-job' })),
      getJobs: vi.fn(async () => ({
        items: [summary('new-job', 'pending')],
        total: 1,
        limit: 20,
        offset: 0,
      })),
      cancelJob: vi.fn(),
      getJob: vi.fn(async (id: string) => detail(id, 'pending')),
    };

    const detailPoller = new PollController({ intervalMs: 1000 });
    const stopSpy = vi.spyOn(detailPoller, 'stop');
    const store = createJobsStore({ api, detailPoller });

    store.getState().setActiveJob('old-job');
    const stopsAfterSelect = stopSpy.mock.calls.length;

    await store.getState().createJob('https://example.com/1\nhttps://example.com/2\n');
    await flushMicrotasks();

    expect(api.createJob).toHaveBeenCalledWith([
      'https://example.com/1',
      'https://example.com/2',
    ]);
    expect(store.getState().activeJobId).toBe('new-job');
    expect(stopSpy.mock.calls.length).toBeGreaterThan(stopsAfterSelect);
  });

  it('terminal status stops detail polling', async () => {
    const api: JobsApiPort = {
      createJob: vi.fn(),
      getJobs: vi.fn(async () => ({ items: [], total: 0, limit: 20, offset: 0 })),
      cancelJob: vi.fn(),
      getJob: vi.fn(async () => detail('done-job', 'completed')),
    };

    const detailPoller = new PollController({ intervalMs: 1000 });
    const stopSpy = vi.spyOn(detailPoller, 'stop');
    const store = createJobsStore({ api, detailPoller });

    store.getState().setActiveJob('done-job');
    await vi.advanceTimersByTimeAsync(0);
    await flushMicrotasks();

    expect(store.getState().detailsById['done-job']?.status).toBe('completed');
    expect(stopSpy).toHaveBeenCalled();
    expect(detailPoller.isRunning).toBe(false);

    const callsAfterTerminal = api.getJob.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    await flushMicrotasks();
    expect(api.getJob.mock.calls.length).toBe(callsAfterTerminal);
  });
});
