export type JobRuntime = {
  /** Checked by runPool — stop claiming new items when aborted. */
  claimController: AbortController;
  /** Passed into processOne / checker / sleep — aborted only for CANCEL_STRATEGY=abort. */
  workController: AbortController;
};

export class JobRuntimeRegistry {
  private readonly runtimes = new Map<string, JobRuntime>();

  set(jobId: string, runtime: JobRuntime): void {
    this.runtimes.set(jobId, runtime);
  }

  get(jobId: string): JobRuntime | undefined {
    return this.runtimes.get(jobId);
  }

  delete(jobId: string): void {
    this.runtimes.delete(jobId);
  }

  has(jobId: string): boolean {
    return this.runtimes.has(jobId);
  }

  size(): number {
    return this.runtimes.size;
  }

  jobIds(): string[] {
    return [...this.runtimes.keys()];
  }
}
