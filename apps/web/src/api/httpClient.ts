import { apiErrorEnvelopeSchema } from '@repo/shared';
import type { ZodType } from 'zod';

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }

  return false;
}

export type HttpRequestOptions<T> = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  schema: ZodType<T>;
  timeoutMs?: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

function resolveBaseUrl(explicit?: string): string {
  if (explicit !== undefined) {
    return explicit.replace(/\/$/, '');
  }

  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  if (typeof fromEnv === 'string') {
    return fromEnv.replace(/\/$/, '');
  }

  return '';
}

function combineSignals(
  external: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (external === undefined) {
    return timeoutSignal;
  }
  return AbortSignal.any([external, timeoutSignal]);
}

async function parseJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError('INTERNAL_ERROR', response.status, 'Invalid JSON response');
  }
}

export async function requestJson<T>(
  path: string,
  options: HttpRequestOptions<T>,
): Promise<T> {
  const baseUrl = resolveBaseUrl(options.baseUrl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = combineSignals(options.signal, timeoutMs);

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
    signal,
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}${path}`, init);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new ApiError(
      'INTERNAL_ERROR',
      0,
      error instanceof Error ? error.message : 'Network request failed',
    );
  }

  const payload = await parseJsonBody(response);

  if (!response.ok) {
    const parsedError = apiErrorEnvelopeSchema.safeParse(payload);
    if (parsedError.success) {
      const { code, message, details } = parsedError.data.error;
      if (details !== undefined) {
        throw new ApiError(code, response.status, message, details);
      }
      throw new ApiError(code, response.status, message);
    }

    throw new ApiError(
      'INTERNAL_ERROR',
      response.status,
      `Request failed with status ${response.status}`,
    );
  }

  const parsed = options.schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(
      'INTERNAL_ERROR',
      response.status,
      'Response validation failed',
      parsed.error.issues,
    );
  }

  return parsed.data;
}
