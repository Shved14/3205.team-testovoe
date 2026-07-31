# Project Audit Results

| File:Line | Problem | Severity | How to Fix |
|-----------|---------|----------|------------|
| apps/web/src/components/UrlTable/UrlTable.tsx:45-49 | formatDuration function returns '-' instead of calculating actual duration from start/finish times | Medium | Calculate duration from startedAt/finishedAt timestamps if available in UrlResult, or remove the column if timing data is not available |
| apps/web/src/hooks/useJobUrlSync.ts:15-22 | Potential race condition: useEffect depends on activeJobId but calls setActiveJob which could cause re-render loop | Low | Add proper dependency array or use useRef to prevent re-render cycles |
| apps/api/src/jobs/job-runner.ts:85-92 | cancel() doesn't check if job exists before accessing registry | Low | Move job existence check before registry access for consistency |
| apps/web/src/store/jobs-store.ts:74 | detailsById grows unbounded - no cleanup mechanism for old job details | Medium | Implement cleanup of old job details when jobs are removed or add TTL-based eviction |
| apps/api/src/jobs/job-store.ts:66-97 | create() generates new IDs for each URL, making duplicate detection impossible | Low | This is by design per requirements, but could be noted as intentional |
| apps/web/src/components/UrlTable/UrlTable.tsx:45-49 | Comment mentions "we don't have start time data" but startedAt field exists in entity | Medium | Use startedAt and finishedAt fields to calculate actual duration |
| apps/web/src/App.tsx:7 | useJobUrlSync hook called unconditionally on every render | Low | Move to useEffect or use proper hook placement |

## Layer Violations: None Found
- No direct fetch calls in components (all use store actions)
- No store imports in api/ layer (only JobStore interface)
- No @nestjs imports in domain code (only in controllers, modules)
- No direct Math.random/Date.now/setTimeout in domain code (all injected)

## Leaks: Minor Issues Found
- detailsById grows unbounded - needs cleanup mechanism
- Otherwise proper cleanup of AbortControllers, timers, and registry entries

## Race Conditions: Generally Well-Handled
- Generation-based staleness detection prevents old jobId responses
- Terminal status checks prevent runner overwrites
- PollController properly handles React StrictMode scenarios

## Error Handling: Proper
- Unhandled promises caught and logged
- Stack traces not exposed to clients
- Worker exceptions handled within runPool contract

## Types: Clean
- No `any` types used inappropriately
- No `@ts-ignore` directives
- Type assertions are justified

## Garbage: Clean
- No console.log statements
- No TODO/FIXME comments
- No dead code found
- Dependencies appear to be used

## Specification Compliance
- Backend: All 5 points implemented correctly
- Frontend: 4 points implemented, minor deviation in duration display
