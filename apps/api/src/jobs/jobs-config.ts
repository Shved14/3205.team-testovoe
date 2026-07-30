export type CancelStrategy = 'abort' | 'drain';

export type JobsConfig = {
  perJobConcurrency: number;
  maxArtificialDelayMs: number;
  cancelStrategy: CancelStrategy;
};

export const DEFAULT_JOBS_CONFIG: JobsConfig = {
  perJobConcurrency: 5,
  maxArtificialDelayMs: 0,
  cancelStrategy: 'abort',
};
