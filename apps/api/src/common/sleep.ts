/**
 * Resolves `true` after `ms` if not aborted; `false` if aborted before or during the wait.
 * Removes the abort listener on normal completion. Abort subscription uses `{ once: true }`.
 */
export function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const onAbort = (): void => {
      clearTimeout(timeoutId);
      resolve(false);
    };

    timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);

    signal.addEventListener('abort', onAbort, { once: true });
  });
}
