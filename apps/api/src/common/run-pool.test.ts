import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runPool } from './run-pool';
import { sleep } from './sleep';

describe('runPool', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps peak concurrency at limit and processes every item', async () => {
    const items = Array.from({ length: 20 }, (_, index) => index);
    const processed: number[] = [];
    let inFlight = 0;
    let peakConcurrency = 0;
    const idleSignal = new AbortController().signal;

    const poolPromise = runPool(
      items,
      5,
      async (item) => {
        inFlight += 1;
        peakConcurrency = Math.max(peakConcurrency, inFlight);
        await sleep(100, idleSignal);
        inFlight -= 1;
        processed.push(item);
      },
      new AbortController().signal,
    );

    await vi.runAllTimersAsync();
    await poolPromise;

    expect(peakConcurrency).toBe(5);
    expect(processed).toHaveLength(20);
    expect([...processed].sort((left, right) => left - right)).toEqual(items);
  });

  it('processes nothing when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const processed: number[] = [];

    await runPool(
      [1, 2, 3, 4, 5],
      3,
      async (item) => {
        processed.push(item);
      },
      controller.signal,
    );

    expect(processed).toEqual([]);
  });

  it('stops claiming remaining items after mid-flight abort and resolves', async () => {
    const controller = new AbortController();
    const items = Array.from({ length: 20 }, (_, index) => index);
    const processed: number[] = [];
    const idleSignal = new AbortController().signal;

    const poolPromise = runPool(
      items,
      5,
      async (item) => {
        processed.push(item);
        await sleep(100, idleSignal);
      },
      controller.signal,
    );

    await Promise.resolve();
    controller.abort();
    await vi.runAllTimersAsync();
    await expect(poolPromise).resolves.toBeUndefined();

    expect(processed).toHaveLength(5);
    expect(processed.every((item) => item < 5)).toBe(true);
  });
});
