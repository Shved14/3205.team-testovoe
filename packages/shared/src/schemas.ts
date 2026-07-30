import { z } from 'zod';

import { JOB_STATUSES, URL_STATUSES } from './types';

const MAX_URLS_PER_JOB = 500;
const MAX_URL_LENGTH = 2048;

function isHttpOrHttps(protocol: string): boolean {
  return protocol === 'http:' || protocol === 'https:';
}

function hasUserInfo(url: URL): boolean {
  return url.username !== '' || url.password !== '';
}

export const jobUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_URL_LENGTH)
  .superRefine((value, context) => {
    let parsed: URL;

    try {
      parsed = new URL(value);
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid URL',
      });
      return;
    }

    if (!isHttpOrHttps(parsed.protocol)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'URL protocol must be http or https',
      });
      return;
    }

    if (hasUserInfo(parsed)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'URL must not contain username or password',
      });
    }
  });

export const createJobSchema = z.object({
  urls: z
    .array(jobUrlSchema)
    .min(1)
    .superRefine((urls, context) => {
      if (urls.length > MAX_URLS_PER_JOB) {
        context.addIssue({
          code: z.ZodIssueCode.too_big,
          maximum: MAX_URLS_PER_JOB,
          type: 'array',
          inclusive: true,
          message: `Expected at most ${MAX_URLS_PER_JOB} URLs`,
          path: [MAX_URLS_PER_JOB],
        });
      }
    }),
});

export type CreateJobRequest = z.infer<typeof createJobSchema>;

export const jobStatusSchema = z.enum(JOB_STATUSES);
export const urlStatusSchema = z.enum(URL_STATUSES);

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  status: jobStatusSchema.optional(),
});

export type ListJobsQuery = z.infer<typeof listQuerySchema>;

export const jobStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
});

export const jobSummarySchema = z.object({
  id: z.string().min(1),
  status: jobStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  stats: jobStatsSchema,
});

export const urlResultSchema = z.object({
  url: z.string().min(1),
  status: urlStatusSchema,
  httpStatusCode: z.number().int().nullable(),
  errorMessage: z.string().nullable(),
  checkedAt: z.string().nullable(),
});

export const createJobResponseSchema = z.object({
  jobId: z.string().min(1),
});

export const jobListResponseSchema = z.object({
  items: z.array(jobSummarySchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export const jobDetailSchema = jobSummarySchema.extend({
  results: z.array(urlResultSchema),
});

export const cancelJobResponseSchema = z.object({
  jobId: z.string().min(1),
  status: jobStatusSchema,
  cancelledUrls: z.number().int().nonnegative(),
});

export const apiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  }),
});
