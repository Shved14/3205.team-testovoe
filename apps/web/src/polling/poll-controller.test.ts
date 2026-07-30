import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { computePollBackoffMs, PollController } from './poll-controller';

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function latestScheduledDelay(spy: ReturnType<typeof vi.spyOn>): number {
  for (let index = spy.mock.calls.length - 1; index >= 0; index -= 1) {
    const delay = spy.mock.calls[index]?.[1];
    if (typeof delay === 'number') {
      return delay;
    }
  }
  throw new Error('No setTimeout delay captured');
}

describe('PollController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stop() ends the chain and prevents further ticks', async () => {
    const controller = new PollController();
    const tick = vi.fn(async () => 'continue' as const);

    controller.start('job-1', tick);
    await vi.advanceTimersByTimeAsync(0);
    await flushMicrotasks();
    expect(tick).toHaveBeenCalledTimes(1);

    controller.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    await flushMicrotasks();
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('stops polling when tick returns stop', async () => {
    const controller = new PollController();
    const tick = vi
      .fn()
      .mockResolvedValueOnce('continue')
      .mockResolvedValueOnce('stop');

    controller.start('job-1', tick);
    await vi.advanceTimersByTimeAsync(0);
    await flushMicrotasks();
    expect(tick).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();
    expect(tick).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(10_000);
    await flushMicrotasks();
    expect(tick).toHaveBeenCalledTimes(2);
    expect(controller.isRunning).toBe(false);
  });

  it('start() on an active poller does not leave two parallel chains', async () => {
    const controller = new PollController();
    const first = vi.fn(async () => 'continue' as const);
    const second = vi.fn(async () => 'continue' as const);

    controller.start('job-a', first);
    await vi.advanceTimersByTimeAsync(0);
    await flushMicrotasks();
    expect(first).toHaveBeenCalledTimes(1);

    controller.start('job-b', second);
    await vi.advanceTimersByTimeAsync(0);
    await flushMicrotasks();
    expect(second).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    await flushMicrotasks();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(6);
  });

  it('does not apply a late response after stop() as a write', async () => {
    const controller = new PollController();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;

    controller.start('job-1', async (_jobId, _signal, generation) => {
      await gate;
      if (!controller.isCurrentGeneration(generation)) {
        return 'stop';
      }
      writes += 1;
      return 'continue';
    });

    await vi.advanceTimersByTimeAsync(0);
    controller.stop();
    release?.();
    await flushMicrotasks();

    expect(writes).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    await flushMicrotasks();
    expect(writes).toBe(0);
  });

  it('grows backoff 1s → 2s → 4s → 8s → 8s and resets after a successful tick', async () => {
    expect([1, 2, 3, 4, 5].map((count) => computePollBackoffMs(count))).toEqual([
      1000, 2000, 4000, 8000, 8000,
    ]);

    const controller = new PollController();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    let mode: 'fail' | 'succeed' = 'fail';

    controller.start('job-1', async () => {
      if (mode === 'fail') {
        throw new Error('network');
      }
      return 'continue';
    });

    const observed: number[] = [];

    for (let failure = 0; failure < 4; failure += 1) {
      await vi.advanceTimersByTimeAsync(failure === 0 ? 0 : observed[failure - 1]!);
      await flushMicrotasks();
      observed.push(latestScheduledDelay(setTimeoutSpy));
    }

    expect(observed).toEqual([1000, 2000, 4000, 8000]);

    await vi.advanceTimersByTimeAsync(8000);
    await flushMicrotasks();
    expect(controller.hasError).toBe(true);
    expect(controller.isRunning).toBe(false);

    mode = 'fail';
    setTimeoutSpy.mockClear();
    controller.start('job-2', async () => {
      if (mode === 'fail') {
        throw new Error('network');
      }
      return 'continue';
    });

    await vi.advanceTimersByTimeAsync(0);
    await flushMicrotasks();
    expect(latestScheduledDelay(setTimeoutSpy)).toBe(1000);

    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();
    expect(latestScheduledDelay(setTimeoutSpy)).toBe(2000);

    mode = 'succeed';
    await vi.advanceTimersByTimeAsync(2000);
    await flushMicrotasks();
    expect(latestScheduledDelay(setTimeoutSpy)).toBe(1000);

    mode = 'fail';
    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();
    expect(latestScheduledDelay(setTimeoutSpy)).toBe(1000);
  });

  it('does not count abort errors as failures', async () => {
    const controller = new PollController();
    let calls = 0;

    controller.start('job-1', async () => {
      calls += 1;
      if (calls === 1) {
        throw new DOMException('aborted', 'AbortError');
      }
      return 'continue';
    });

    await vi.advanceTimersByTimeAsync(0);
    await flushMicrotasks();
    expect(controller.hasError).toBe(false);

    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();
    expect(calls).toBe(2);
    expect(controller.hasError).toBe(false);
  });
});
