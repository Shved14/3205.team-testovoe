import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Clock } from '../common/clock';
import { FetchUrlChecker, REQUEST_TIMEOUT_MS } from './fetch-url-checker';
import { mapFetchError } from './map-fetch-error';

function createClock(startedAt = 1000): Clock {
  let current = startedAt;

  return {
    now: () => new Date(0),
    monotonicMs: () => {
      current += 25;
      return current;
    },
  };
}

function createResponse(init: {
  status: number;
  statusText?: string;
  url: string;
}): Response {
  return {
    status: init.status,
    statusText: init.statusText ?? '',
    url: init.url,
  } as Response;
}

describe('mapFetchError', () => {
  it('maps DNS codes from err.cause.code', () => {
    expect(
      mapFetchError(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }), 12),
    ).toMatchObject({ kind: 'error', errorCode: 'DNS_NOT_FOUND', httpDurationMs: 12 });

    expect(
      mapFetchError(Object.assign(new TypeError('fetch failed'), { cause: { code: 'EAI_AGAIN' } }), null),
    ).toMatchObject({ kind: 'error', errorCode: 'DNS_NOT_FOUND', httpDurationMs: null });
  });

  it('maps connection and timeout codes', () => {
    expect(
      mapFetchError({ cause: { code: 'ECONNREFUSED' } }, 1),
    ).toMatchObject({ errorCode: 'CONN_REFUSED' });

    expect(
      mapFetchError({ cause: { code: 'ECONNRESET' } }, 1),
    ).toMatchObject({ errorCode: 'CONN_RESET' });

    expect(
      mapFetchError({ cause: { code: 'ETIMEDOUT' } }, 1),
    ).toMatchObject({ errorCode: 'TIMEOUT' });
  });

  it('maps TLS codes', () => {
    for (const code of [
      'CERT_HAS_EXPIRED',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    ]) {
      expect(mapFetchError({ cause: { code } }, 3)).toMatchObject({
        errorCode: 'TLS_ERROR',
      });
    }
  });

  it('maps too many redirects', () => {
    expect(
      mapFetchError({ code: 'UND_ERR_TOO_MANY_REDIRECTS', message: 'redirect' }, 4),
    ).toMatchObject({ errorCode: 'TOO_MANY_REDIRECTS' });
  });

  it('maps unknown errors without stack traces and truncates message', () => {
    const longMessage = 'x'.repeat(500);
    const error = new Error(longMessage);
    error.stack = 'Error: secret stack';

    const outcome = mapFetchError(error, 5);

    expect(outcome).toEqual({
      kind: 'error',
      errorCode: 'UNKNOWN',
      errorMessage: 'x'.repeat(300),
      httpDurationMs: 5,
    });
    expect(JSON.stringify(outcome)).not.toContain('secret stack');
  });
});

describe('FetchUrlChecker', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns success for HTTP 200', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      createResponse({ status: 200, statusText: 'OK', url: 'https://example.com/' }),
    );

    const checker = new FetchUrlChecker(createClock());
    const outcome = await checker.check('https://example.com/', new AbortController().signal);

    expect(outcome).toEqual({
      kind: 'success',
      httpStatus: 200,
      finalUrl: 'https://example.com/',
      redirected: false,
      httpDurationMs: expect.any(Number),
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ method: 'HEAD', redirect: 'follow' }),
    );
  });

  it('returns success for followed 301 with redirected=true', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      createResponse({
        status: 301,
        statusText: 'Moved Permanently',
        url: 'https://example.com/final',
      }),
    );

    const outcome = await new FetchUrlChecker(createClock()).check(
      'https://example.com/start',
      new AbortController().signal,
    );

    expect(outcome).toEqual({
      kind: 'success',
      httpStatus: 301,
      finalUrl: 'https://example.com/final',
      redirected: true,
      httpDurationMs: expect.any(Number),
    });
  });

  it('returns http_error for 404 with HTTP_ERROR message', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      createResponse({ status: 404, statusText: 'Not Found', url: 'https://example.com/missing' }),
    );

    const outcome = await new FetchUrlChecker(createClock()).check(
      'https://example.com/missing',
      new AbortController().signal,
    );

    expect(outcome).toEqual({
      kind: 'http_error',
      httpStatus: 404,
      finalUrl: 'https://example.com/missing',
      redirected: false,
      errorCode: 'HTTP_ERROR',
      errorMessage: 'HTTP 404 Not Found',
      httpDurationMs: expect.any(Number),
    });
  });

  it('returns http_error for 500', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      createResponse({ status: 500, statusText: 'Internal Server Error', url: 'https://example.com/' }),
    );

    const outcome = await new FetchUrlChecker(createClock()).check(
      'https://example.com/',
      new AbortController().signal,
    );

    expect(outcome).toMatchObject({
      kind: 'http_error',
      httpStatus: 500,
      errorCode: 'HTTP_ERROR',
      errorMessage: 'HTTP 500 Internal Server Error',
    });
  });

  it('returns aborted when the external signal is aborted before fetch', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    const controller = new AbortController();
    controller.abort();

    const outcome = await new FetchUrlChecker(createClock()).check(
      'https://example.com/',
      controller.signal,
    );

    expect(outcome).toEqual({ kind: 'aborted' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns aborted when the external signal aborts during fetch', async () => {
    const controller = new AbortController();

    globalThis.fetch = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            reject(new DOMException('This operation was aborted', 'AbortError'));
          },
          { once: true },
        );
      });
    });

    const checkPromise = new FetchUrlChecker(createClock()).check(
      'https://example.com/',
      controller.signal,
    );

    controller.abort();
    await expect(checkPromise).resolves.toEqual({ kind: 'aborted' });
  });

  it('returns TIMEOUT when the request timeout wins', async () => {
    const timeoutController = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutController.signal);

    globalThis.fetch = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            reject(new DOMException('This operation was aborted', 'AbortError'));
          },
          { once: true },
        );
      });
    });

    const checkPromise = new FetchUrlChecker(createClock(), REQUEST_TIMEOUT_MS).check(
      'https://example.com/',
      new AbortController().signal,
    );

    timeoutController.abort();

    await expect(checkPromise).resolves.toEqual({
      kind: 'error',
      errorCode: 'TIMEOUT',
      errorMessage: 'Request timed out',
      httpDurationMs: expect.any(Number),
    });
  });

  it('never throws and maps network TypeError via cause.code', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }),
    );

    await expect(
      new FetchUrlChecker(createClock()).check('https://missing.example', new AbortController().signal),
    ).resolves.toMatchObject({
      kind: 'error',
      errorCode: 'DNS_NOT_FOUND',
    });
  });
});
