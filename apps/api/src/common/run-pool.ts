/**
 * Runs `worker` across `items` with at most `limit` concurrent workers sharing one cursor.
 *
 * Worker contract: must never throw. Callers handle errors inside the worker.
 * When `signal` is aborted, workers stop claiming new items; in-flight work may finish.
 */
export async function runPool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  if (items.length === 0 || limit <= 0) {
    return;
  }

  let nextIndex = 0;
  const workerCount = Math.min(limit, items.length);

  const runWorker = async (): Promise<void> => {
    for (;;) {
      if (signal.aborted) {
        return;
      }

      const currentIndex = nextIndex;
      if (currentIndex >= items.length) {
        return;
      }

      nextIndex += 1;
      const item = items[currentIndex];
      if (item === undefined) {
        return;
      }

      await worker(item, currentIndex);
    }
  };

  const workers: Promise<void>[] = [];
  for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
    workers.push(runWorker());
  }

  await Promise.all(workers);
}
