import { afterEach, describe, expect, it, vi } from 'vitest';

import { cancelJob, createJob, getJob, getJobs } from './jobsApi';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('jobsApi', () => {
  it('createJob validates CreateJobResponse', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ jobId: 'abc' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(createJob(['https://example.com'])).resolves.toEqual({ jobId: 'abc' });
  });

  it('getJobs / getJob / cancelJob call expected endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: '1',
                status: 'pending',
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
                stats: { total: 1, completed: 0, failed: 0, pending: 1 },
              },
            ],
            total: 1,
            limit: 20,
            offset: 0,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: '1',
            status: 'completed',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:01.000Z',
            stats: { total: 1, completed: 1, failed: 0, pending: 0 },
            results: [
              {
                url: 'https://example.com',
                status: 'done',
                httpStatusCode: 200,
                errorMessage: null,
                checkedAt: '2026-01-01T00:00:01.000Z',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobId: '1',
            status: 'cancelled',
            cancelledUrls: 0,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    vi.stubGlobal('fetch', fetchMock);

    await expect(getJobs({ limit: 20, offset: 0 })).resolves.toMatchObject({ total: 1 });
    await expect(getJob('1')).resolves.toMatchObject({ id: '1', status: 'completed' });
    await expect(cancelJob('1')).resolves.toEqual({
      jobId: '1',
      status: 'cancelled',
      cancelledUrls: 0,
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/jobs?');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/jobs/1');
    expect(fetchMock.mock.calls[2]?.[0]).toBe('/api/jobs/1');
  });
});
