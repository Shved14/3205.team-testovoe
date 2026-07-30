import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiError, isAbortError, requestJson } from './httpClient';

const okSchema = z.object({
  jobId: z.string(),
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('requestJson', () => {
  it('parses a successful JSON response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jobId: 'job-1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await requestJson('/api/jobs', {
      method: 'POST',
      body: { urls: ['https://example.com'] },
      schema: okSchema,
      fetchImpl,
      baseUrl: '',
    });

    expect(result).toEqual({ jobId: 'job-1' });
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/jobs',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ urls: ['https://example.com'] }),
      }),
    );
  });

  it('maps error envelope into ApiError', async () => {
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: 'JOB_NOT_FOUND',
              message: 'Job not found: missing',
              details: { jobId: 'missing' },
            },
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    );

    const error = await requestJson('/api/jobs/missing', {
      schema: okSchema,
      fetchImpl,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      name: 'ApiError',
      code: 'JOB_NOT_FOUND',
      status: 404,
      message: 'Job not found: missing',
      details: { jobId: 'missing' },
    });
  });

  it('propagates abort from the external signal', async () => {
    const controller = new AbortController();
    controller.abort();

    const fetchImpl = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(new DOMException('This operation was aborted', 'AbortError'));
          return;
        }
        signal?.addEventListener(
          'abort',
          () => {
            reject(new DOMException('This operation was aborted', 'AbortError'));
          },
          { once: true },
        );
      });
    });

    const error = await requestJson('/api/jobs', {
      schema: okSchema,
      fetchImpl,
      signal: controller.signal,
    }).catch((caught: unknown) => caught);

    expect(isAbortError(error)).toBe(true);
  });

  it('propagates timeout abort', async () => {
    const timeoutController = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutController.signal);

    const fetchImpl = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
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

    const requestPromise = requestJson('/api/jobs', {
      schema: okSchema,
      fetchImpl,
      timeoutMs: 15_000,
    });

    timeoutController.abort();

    const error = await requestPromise.catch((caught: unknown) => caught);
    expect(isAbortError(error)).toBe(true);
  });
});

describe('isAbortError', () => {
  it('detects AbortError instances', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
    expect(isAbortError(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(
      true,
    );
    expect(isAbortError(new Error('nope'))).toBe(false);
    expect(isAbortError(new ApiError('X', 500, 'nope'))).toBe(false);
  });
});
