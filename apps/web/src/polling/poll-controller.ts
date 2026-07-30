import { isAbortError } from '../api/httpClient';

export type TickResult = 'continue' | 'stop';

export type PollTick = (
  jobId: string,
  signal: AbortSignal,
  generation: number,
) => Promise<TickResult>;

const BASE_INTERVAL_MS = 1000;
const MAX_BACKOFF_MS = 8000;
const MAX_CONSECUTIVE_FAILURES = 5;

export function computePollBackoffMs(consecutiveFailures: number): number {
  const exponent = Math.max(0, consecutiveFailures - 1);
  return Math.min(BASE_INTERVAL_MS * 2 ** exponent, MAX_BACKOFF_MS);
}

export class PollController {
  private generation = 0;
  private jobId: string | null = null;
  private tick: PollTick | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: AbortController | null = null;
  private consecutiveFailures = 0;
  private paused = false;
  private errored = false;

  get hasError(): boolean {
    return this.errored;
  }

  get isRunning(): boolean {
    return this.jobId !== null;
  }

  isCurrentGeneration(generation: number): boolean {
    return generation === this.generation;
  }

  start(jobId: string, tick: PollTick): void {
    this.clearActivePoll({ bumpGeneration: true, abortInFlight: true });
    this.errored = false;
    this.consecutiveFailures = 0;
    this.paused = false;
    this.jobId = jobId;
    this.tick = tick;
    this.generation += 1;
    this.schedule(0, this.generation);
  }

  stop(): void {
    this.clearActivePoll({ bumpGeneration: true, abortInFlight: true });
    this.paused = false;
  }

  pause(): void {
    this.paused = true;
    this.clearTimer();
  }

  resume(): void {
    if (this.jobId === null || this.tick === null || this.errored) {
      return;
    }

    this.paused = false;
    this.clearTimer();
    this.schedule(0, this.generation);
  }

  private clearActivePoll(options: {
    bumpGeneration: boolean;
    abortInFlight: boolean;
  }): void {
    if (options.bumpGeneration) {
      this.generation += 1;
    }

    if (options.abortInFlight) {
      this.inFlight?.abort();
      this.inFlight = null;
    }

    this.clearTimer();
    this.jobId = null;
    this.tick = null;
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(delayMs: number, generation: number): void {
    if (this.paused || this.jobId === null || generation !== this.generation) {
      return;
    }

    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runTick(generation);
    }, delayMs);
  }

  private async runTick(generation: number): Promise<void> {
    if (
      generation !== this.generation ||
      this.paused ||
      this.jobId === null ||
      this.tick === null
    ) {
      return;
    }

    const jobId = this.jobId;
    const tick = this.tick;
    this.inFlight?.abort();
    const controller = new AbortController();
    this.inFlight = controller;

    try {
      const result = await tick(jobId, controller.signal, generation);

      if (!this.isCurrentGeneration(generation)) {
        return;
      }

      if (result === 'stop') {
        this.stop();
        return;
      }

      this.consecutiveFailures = 0;
      this.schedule(BASE_INTERVAL_MS, generation);
    } catch (error) {
      if (!this.isCurrentGeneration(generation)) {
        return;
      }

      if (isAbortError(error)) {
        if (!this.paused && this.jobId !== null) {
          this.schedule(BASE_INTERVAL_MS, generation);
        }
        return;
      }

      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        this.errored = true;
        this.stop();
        return;
      }

      this.schedule(computePollBackoffMs(this.consecutiveFailures), generation);
    } finally {
      if (this.inFlight === controller) {
        this.inFlight = null;
      }
    }
  }
}
