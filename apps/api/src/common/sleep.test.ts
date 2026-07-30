import { afterEach, describe, expect, it, vi } from 'vitest';

import { sleep } from './sleep';

describe('sleep', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(sleep(1000, controller.signal)).resolves.toBe(false);
  });

  it('returns false when aborted during sleep', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const sleepPromise = sleep(1000, controller.signal);

    controller.abort();

    await expect(sleepPromise).resolves.toBe(false);
  });

  it('returns true after a full sleep and removes the abort listener', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const sleepPromise = sleep(1000, controller.signal);

    await vi.advanceTimersByTimeAsync(1000);

    await expect(sleepPromise).resolves.toBe(true);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
