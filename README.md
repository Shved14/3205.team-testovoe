# 3205.team URL Checker

Service for batch URL availability checking with real-time status tracking. The web interface allows users to submit lists of URLs, monitor processing progress, and view detailed results including HTTP status codes, error messages, and timing information.

## Quick Start

### With Docker

```bash
docker compose up --build
open http://localhost:8080
```

### Without Docker

```bash
npm install
npm run dev
```

Web UI: http://localhost:5173
API: http://localhost:3000

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ CreateJobForm│  │   JobList    │  │  JobDetails  │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                 │               │
│         └─────────────────┴─────────────────┘               │
│                           │                                  │
│                    ┌──────▼──────┐                           │
│                    │ jobsStore   │                           │
│                    │ (Zustand)   │                           │
│                    └──────┬──────┘                           │
└───────────────────────────┼─────────────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │  PollController │
                    └───────┬────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                    Nginx  │                                  │
│              ┌────────────▼────────────┐                     │
│              │ /api → http://api:3000  │                     │
│              │ / → SPA (try_files)     │                     │
│              └─────────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                    API    │                                  │
│              ┌────────────▼────────────┐                     │
│              │   JobsController       │                     │
│              └────────────┬────────────┘                     │
│                           │                                  │
│              ┌────────────▼────────────┐                     │
│              │    JobsService         │                     │
│              └────────────┬────────────┘                     │
│                           │                                  │
│         ┌─────────────────┼─────────────────┐               │
│         │                 │                 │               │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐         │
│  │  JobStore   │  │  JobRunner  │  │ FetchUrlChecker│       │
│  │ (in-memory) │  │ (runPool)   │  │  (native fetch)│       │
│  └─────────────┘  └─────────────┘  └───────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

The application consists of a React frontend with Zustand state management, a NestJS backend, and nginx for routing. The frontend polls the API for job status updates using a custom PollController with generation-based staleness detection. The backend processes URLs concurrently using a manual worker pool implemented in runPool.ts. URL checking uses native fetch with AbortSignal for cancellation and dual AbortControllers for interruptible cancellation. All layers use dependency injection with Clock, RandomService, SleepService, and Logger abstractions for testability.

## Design Decisions

| Decision | Choice | Reason | Alternative |
|----------|--------|--------|-------------|
| HTTP status interpretation | 4xx/5xx are errors, not success | Distinguishes infrastructure failures from broken URLs | Treat all responses as success |
| HTTP method | HEAD without GET fallback | HEAD is sufficient for availability checking | GET with fallback on 405 |
| Artificial delay timing | After request, before save, included in durationMs | Simulates realistic processing time while keeping timing clear | Separate field, before request |
| Cancellation strategy | Abort (in-flight interrupted) by default | Immediate response to user action, simpler implementation | Drain (wait for in-flight) via flag |
| Failed job status | Infrastructure failures only | Distinguishes system errors from application-level URL errors | Include HTTP errors as failures |
| Invalid URL handling | 400 on entire job | Fast feedback, prevents partial processing | Per-URL error results |
| Duplicate URLs | Not collapsed | Preserves user intent, simpler implementation | Deduplication |
| State management | Zustand instead of RTK Query | Custom polling logic with terminal status stopping | RTK Query with pollingInterval |
| Concurrency limit | Manual worker pool (runPool) | Full control over cancellation semantics | p-limit, bottleneck, async library |
| Time handling | Clock injection | Testability, deterministic behavior | Direct Date.now() usage |
| Random handling | RandomService injection | Testability, deterministic behavior | Direct Math.random() usage |
| Sleep handling | SleepService injection | Testability, deterministic behavior | Direct setTimeout usage |
| Logger injection | Pino with abstraction | Testability, structured logging | Direct console.log |
| API layer | Direct fetch in components prohibited | Clear separation of concerns, testable components | Inline fetch calls |
| Polling implementation | Custom PollController | Generation-based staleness detection, proper cleanup | setInterval, RTK Query |
| Job storage | In-memory Map | Simplicity for MVP, no persistence requirement | PostgreSQL, Redis |
| Job ID generation | randomUUID | Simple, collision-resistant | Sequential, ULID |
| Cleanup strategy | TTL-based eviction | Automatic resource management | Manual cleanup, LRU |
| Error handling | Typed error classes | Type safety, clear error semantics | String errors, error codes |
| CORS | Development-only | Not needed in production (nginx proxy) | Always enabled |
| Docker runtime | Multi-stage builds | Small image sizes, security | Single-stage builds |
| Init process | dumb-init | Proper signal handling in containers | Direct node execution |

## Non-Trivial Requirements Implementation

### 1. Concurrency Limit (5 per job)

Implemented via custom `runPool` function in `apps/api/src/common/run-pool.ts`. The function maintains a shared cursor across workers and respects an AbortSignal for cancellation. Each worker claims the next index from the cursor until all items are processed or the signal is aborted. The concurrency limit is enforced by spawning exactly `Math.min(limit, items.length)` worker coroutines.

### 2. Interruptible Cancellation

Implemented in `apps/api/src/jobs/job-runner.ts` using dual AbortControllers. The `claimController` stops new work from being claimed, while the `workController` aborts in-flight requests when `CANCEL_STRATEGY=abort`. The `processOne` method checks for abort signals before and after each async operation (request, sleep, save). Cancel strategy is configurable via `CANCEL_STRATEGY` environment variable.

### 3. Polling Stop on Job Switch

Implemented in `apps/web/src/store/jobs-store.ts` via `setActiveJob` method. When switching jobs, `stopDetailPolling()` is called first, which bumps the PollController generation and aborts in-flight requests. The `writeDetailIfCurrent` function checks both generation and `activeJobId` before writing results, discarding stale responses from the previous job's polling cycle.

### 4. Stale Response Discarding

Implemented in `apps/web/src/polling/poll-controller.ts` using generation numbers. Each call to `start()` increments the generation counter. The `runTick` method verifies the generation before processing results and writing to state. In-flight requests from previous generations are aborted via the in-flight AbortController. The store's `writeDetailIfCurrent` provides a second layer of validation.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| NODE_ENV | development | Environment mode (development/production/test) |
| PORT | 3000 | API server port |
| LOG_LEVEL | info | Logging level (fatal/error/warn/info/debug/trace/silent) |
| CORS_ORIGIN | undefined | CORS origin for development (disabled in production) |
| PER_JOB_CONCURRENCY | 5 | Maximum concurrent URL checks per job |
| MAX_ARTIFICIAL_DELAY_MS | 0 | Maximum artificial delay after each request (ms) |
| CANCEL_STRATEGY | abort | Cancellation strategy (abort/drain) |
| REQUEST_TIMEOUT_MS | 10000 | HTTP request timeout (ms) |
| JOB_TTL_MS | 86400000 | Job time-to-live before cleanup (ms) |
| MAX_JOBS | 1000 | Maximum jobs in memory |
| CLEANUP_INTERVAL_MS | 60000 | Cleanup interval for expired jobs (ms) |
| SHUTDOWN_TIMEOUT_MS | 10000 | Graceful shutdown timeout (ms) |

## API Examples

### Create Job

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://example.com", "https://example.org"]}'
```

Response:
```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

### List Jobs

```bash
curl http://localhost:3000/api/jobs?limit=10&offset=0
```

Response:
```json
{
  "items": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "status": "running",
      "createdAt": "2026-07-31T12:00:00.000Z",
      "updatedAt": "2026-07-31T12:00:05.000Z",
      "stats": {
        "total": 2,
        "completed": 1,
        "failed": 0,
        "pending": 1
      }
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0
}
```

### Get Job Details

```bash
curl http://localhost:3000/api/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

Response:
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "completed",
  "createdAt": "2026-07-31T12:00:00.000Z",
  "updatedAt": "2026-07-31T12:00:10.000Z",
  "stats": {
    "total": 2,
    "completed": 2,
    "failed": 0,
    "pending": 0
  },
  "results": [
    {
      "url": "https://example.com",
      "status": "done",
      "httpStatusCode": 200,
      "errorMessage": null,
      "checkedAt": "2026-07-31T12:00:05.000Z"
    },
    {
      "url": "https://example.org",
      "status": "done",
      "httpStatusCode": 200,
      "errorMessage": null,
      "checkedAt": "2026-07-31T12:00:10.000Z"
    }
  ]
}
```

### Cancel Job

```bash
curl -X DELETE http://localhost:3000/api/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

Response:
```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "cancelled",
  "cancelledUrls": 1
}
```

### Health Check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "uptimeMs": 123456,
  "jobs": {
    "total": 5,
    "active": 2
  }
}
```

## Tests

### Coverage

- **Shared package**: URL validation schemas, type definitions
- **API**: Job store transitions, worker pool, URL checker, job runner, job service
- **Web**: HTTP client, jobs API, polling controller, jobs store, UI components (CreateJobForm, JobDetails)

### Running Tests

```bash
# All packages
npm test

# Specific package
npm test -w @repo/shared
npm test -w @repo/api
npm test -w @repo/web

# With coverage
npm test -- --coverage
```

### Test Characteristics

- No network calls (all fetch mocked)
- No timers > 100ms (all time/sleep/random injected)
- Fast execution (< 1s total)
- RTL tests for React components
- Unit tests for business logic
- Integration tests for store polling behavior

## Production Considerations

### Database
Replace in-memory JobStore with PostgreSQL for persistence and job durability across restarts.

### Message Queue
Implement BullMQ with Redis for job queuing, allowing horizontal scaling of workers and better job management.

### Worker Separation
Split API and workers into separate services. API handles HTTP, workers process jobs independently.

### Real-time Updates
Replace polling with Server-Sent Events (SSE) or WebSocket for immediate status updates without client-side polling overhead.

### Idempotency
Implement idempotent job creation using request deduplication keys to prevent duplicate jobs on retry.

### Rate Limiting
Add rate limiting per IP and per user to prevent abuse (e.g., 100 jobs per hour per IP).

### Retry with Jitter
Implement exponential backoff with jitter for failed URL checks to handle temporary network issues.

### Metrics
Add Prometheus metrics for job processing rates, error rates, queue depths, and system health.

### Tracing
Implement distributed tracing (OpenTelemetry) for request correlation and performance analysis.

### Security
Add authentication/authorization, input sanitization, and request size limits.

## Simplifications and Limitations

### Data Persistence
Jobs are stored in-memory and lost on restart. No database persistence implemented.

### Horizontal Scaling
Single-instance deployment. No support for multiple API or worker instances.

### Job Deduplication
Duplicate URLs in a single job are processed separately. No deduplication across jobs.

### URL Validation
Validation is performed at job creation time. No runtime validation of malformed URLs.

### Error Recovery
Failed jobs remain in failed state. No automatic retry mechanism for failed URLs.

### Resource Limits
Hard limits on MAX_JOBS and PER_JOB_CONCURRENCY. No dynamic resource allocation.

### Authentication
No authentication or authorization. All endpoints are publicly accessible.

### Monitoring
Basic health check only. No detailed metrics, logging aggregation, or alerting.

### Testing
No end-to-end tests. Limited integration testing across service boundaries.

### Web UI
Basic functionality only. No advanced filtering, sorting, or export features.

### Cancellation
Drain strategy not implemented. Only abort strategy is available.

### Rate Limiting
No rate limiting on job creation or API endpoints.

### Request Prioritization
All jobs and URLs are processed equally. No priority queue or weighted scheduling.
