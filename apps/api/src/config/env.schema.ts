import { z } from 'zod';

/**
 * Environment variables (§10). Invalid values fail process startup with a clear message.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  CORS_ORIGIN: z.string().optional(),
  PER_JOB_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
  MAX_ARTIFICIAL_DELAY_MS: z.coerce.number().int().min(0).max(60_000).default(0),
  CANCEL_STRATEGY: z.enum(['abort', 'drain']).default('abort'),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1).max(300_000).default(10_000),
  JOB_TTL_MS: z.coerce.number().int().min(1_000).default(24 * 60 * 60 * 1000),
  MAX_JOBS: z.coerce.number().int().min(1).default(1000),
  CLEANUP_INTERVAL_MS: z.coerce.number().int().min(1_000).default(60_000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(100).default(10_000),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
