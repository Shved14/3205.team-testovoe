import type { Clock } from '../common/clock';
import { mapFetchError } from './map-fetch-error';
import type { CheckOutcome, UrlChecker } from './url-checker';

export const REQUEST_TIMEOUT_MS = 10_000;

export class FetchUrlChecker implements UrlChecker {
  constructor(
    private readonly clock: Clock,
    private readonly requestTimeoutMs: number = REQUEST_TIMEOUT_MS,
  ) {}

  async check(url: string, signal: AbortSignal): Promise<CheckOutcome> {
    if (signal.aborted) {
      return { kind: 'aborted' };
    }

    const timeoutSignal = AbortSignal.timeout(this.requestTimeoutMs);
    const combinedSignal = AbortSignal.any([signal, timeoutSignal]);
    const startedAt = this.clock.monotonicMs();

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: combinedSignal,
      });

      const httpDurationMs = elapsedMs(this.clock, startedAt);
      const finalUrl = response.url.length > 0 ? response.url : url;
      const redirected = finalUrl !== url;
      const httpStatus = response.status;

      if (httpStatus < 400) {
        return {
          kind: 'success',
          httpStatus,
          finalUrl,
          redirected,
          httpDurationMs,
        };
      }

      const statusText = response.statusText.trim();
      const errorMessage =
        statusText.length > 0 ? `HTTP ${httpStatus} ${statusText}` : `HTTP ${httpStatus}`;

      return {
        kind: 'http_error',
        httpStatus,
        finalUrl,
        redirected,
        errorCode: 'HTTP_ERROR',
        errorMessage,
        httpDurationMs,
      };
    } catch (error) {
      const httpDurationMs = elapsedMs(this.clock, startedAt);

      if (signal.aborted) {
        return { kind: 'aborted' };
      }

      if (timeoutSignal.aborted) {
        return {
          kind: 'error',
          errorCode: 'TIMEOUT',
          errorMessage: 'Request timed out',
          httpDurationMs,
        };
      }

      return mapFetchError(error, httpDurationMs);
    }
  }
}

function elapsedMs(clock: Clock, startedAt: number): number {
  return Math.max(0, Math.round(clock.monotonicMs() - startedAt));
}
