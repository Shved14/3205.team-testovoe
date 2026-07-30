import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import type { CheckOutcome, UrlChecker } from '../checker/url-checker';
import { URL_CHECKER } from '../checker/tokens';
import { AppModule } from '../app.module';
import type { AppConfigService } from '../config/config.service';
import { APP_CONFIG } from '../config/tokens';
import { DomainExceptionFilter } from '../http/domain-exception.filter';
import { SilentLogger } from '../jobs/app-logger';
import { APP_LOGGER } from '../jobs/tokens';

function success(url: string): CheckOutcome {
  return {
    kind: 'success',
    httpStatus: 200,
    finalUrl: url,
    redirected: false,
    httpDurationMs: 1,
  };
}

async function pollUntil(
  app: INestApplication,
  jobId: string,
  predicate: (body: { status: string }) => boolean,
): Promise<{ status: string; stats: { total: number; completed: number; failed: number; pending: number }; results: Array<{ status: string }> }> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await request(app.getHttpServer() as App)
      .get(`/api/jobs/${jobId}`)
      .expect((res) => {
        expect([200, 304]).toContain(res.status);
      });

    if (response.status === 200 && predicate(response.body as { status: string })) {
      return response.body as {
        status: string;
        stats: { total: number; completed: number; failed: number; pending: number };
        results: Array<{ status: string }>;
      };
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
  }

  throw new Error(`Timed out polling job ${jobId}`);
}

describe('HTTP jobs API', () => {
  let app: INestApplication;
  let checker: { check: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    checker = {
      check: vi.fn(async (url: string, signal: AbortSignal) => {
        if (signal.aborted) {
          return { kind: 'aborted' };
        }
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 30);
        });
        if (signal.aborted) {
          return { kind: 'aborted' };
        }
        return success(url);
      }),
    };

    const testConfig = {
      nodeEnv: 'test',
      port: 0,
      logLevel: 'silent',
      corsOrigin: undefined,
      perJobConcurrency: 5,
      maxArtificialDelayMs: 0,
      cancelStrategy: 'abort',
      requestTimeoutMs: 10_000,
      jobTtlMs: 60_000,
      maxJobs: 1000,
      cleanupIntervalMs: 60_000,
      shutdownTimeoutMs: 1000,
      isDevelopment: false,
    } as unknown as AppConfigService;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(APP_CONFIG)
      .useValue(testConfig)
      .overrideProvider(URL_CHECKER)
      .useValue(checker as UrlChecker)
      .overrideProvider(APP_LOGGER)
      .useValue(new SilentLogger())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainExceptionFilter(new SilentLogger()));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('create → poll → completed with correct stats', async () => {
    checker.check.mockImplementation(async (url: string) => success(url));

    const created = await request(app.getHttpServer() as App)
      .post('/api/jobs')
      .send({
        urls: ['https://example.com/1', 'https://example.com/2', 'https://example.com/3'],
      })
      .expect(201);

    const jobId = (created.body as { jobId: string }).jobId;
    const detail = await pollUntil(app, jobId, (body) => body.status === 'completed');

    expect(detail.status).toBe('completed');
    expect(detail.stats).toEqual({
      total: 3,
      completed: 3,
      failed: 0,
      pending: 0,
    });
  });

  it('create → cancel after 20ms → cancelled with no success after cancel, responds under 100ms', async () => {
    checker.check.mockImplementation(async (url: string, signal: AbortSignal) => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 80);
      });
      if (signal.aborted) {
        return { kind: 'aborted' };
      }
      return success(url);
    });

    const created = await request(app.getHttpServer() as App)
      .post('/api/jobs')
      .send({
        urls: Array.from({ length: 8 }, (_, index) => `https://example.com/${index}`),
      })
      .expect(201);

    const jobId = (created.body as { jobId: string }).jobId;

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });

    const startedAt = performance.now();
    const cancelled = await request(app.getHttpServer() as App)
      .delete(`/api/jobs/${jobId}`)
      .expect(200);
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeLessThan(100);
    expect(cancelled.body).toMatchObject({
      jobId,
      status: 'cancelled',
    });

    const detail = await request(app.getHttpServer() as App)
      .get(`/api/jobs/${jobId}`)
      .expect(200);

    const body = detail.body as {
      status: string;
      results: Array<{ status: string; httpStatusCode: number | null }>;
    };
    expect(body.status).toBe('cancelled');
    expect(body.results.every((item) => item.status === 'cancelled')).toBe(true);
    expect(body.results.every((item) => item.httpStatusCode === null)).toBe(true);
  });

  it('returns 400 with URL indexes, 404 for unknown id, 409 on repeated DELETE', async () => {
    const invalid = await request(app.getHttpServer() as App)
      .post('/api/jobs')
      .send({ urls: ['ftp://bad.example', 'https://ok.example', 'javascript:alert(1)'] })
      .expect(400);

    const details = (
      invalid.body as {
        error: { code: string; details: Array<{ path: Array<string | number> }> };
      }
    ).error;
    expect(details.code).toBe('VALIDATION_ERROR');
    const indexes = details.details.map((item) => item.path.at(-1));
    expect(indexes).toEqual(expect.arrayContaining([0, 2]));

    await request(app.getHttpServer() as App).get('/api/jobs/missing-id').expect(404);

    checker.check.mockImplementation(async (url: string) => success(url));
    const created = await request(app.getHttpServer() as App)
      .post('/api/jobs')
      .send({ urls: ['https://example.com/done'] })
      .expect(201);
    const jobId = (created.body as { jobId: string }).jobId;
    await pollUntil(app, jobId, (body) => body.status === 'completed');

    await request(app.getHttpServer() as App).delete(`/api/jobs/${jobId}`).expect(409);
  });

  it('returns 304 on repeated GET with matching If-None-Match', async () => {
    checker.check.mockImplementation(async (url: string) => success(url));

    const created = await request(app.getHttpServer() as App)
      .post('/api/jobs')
      .send({ urls: ['https://example.com/etag'] })
      .expect(201);
    const jobId = (created.body as { jobId: string }).jobId;
    await pollUntil(app, jobId, (body) => body.status === 'completed');

    const first = await request(app.getHttpServer() as App)
      .get(`/api/jobs/${jobId}`)
      .expect(200);

    const etag = first.headers['etag'];
    expect(etag).toMatch(/^W\/"/);

    await request(app.getHttpServer() as App)
      .get(`/api/jobs/${jobId}`)
      .set('If-None-Match', String(etag))
      .expect(304);
  });
});
