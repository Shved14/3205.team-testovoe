import type { CheckOutcome } from './url-checker';

const UNKNOWN_MESSAGE_MAX_LENGTH = 300;

const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN']);
const TLS_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

type ErrorWithCause = {
  message?: unknown;
  code?: unknown;
  cause?: unknown;
  name?: unknown;
};

function readErrorCode(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const record = value as ErrorWithCause;
  if (typeof record.code === 'string' && record.code.length > 0) {
    return record.code;
  }

  return undefined;
}

function unwrapErrorCode(error: unknown): string | undefined {
  const direct = readErrorCode(error);
  if (direct !== undefined) {
    return direct;
  }

  if (typeof error === 'object' && error !== null) {
    return readErrorCode((error as ErrorWithCause).cause);
  }

  return undefined;
}

function readErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const record = error as ErrorWithCause;
    if (typeof record.message === 'string' && record.message.length > 0) {
      return record.message;
    }
  }

  if (typeof error === 'string' && error.length > 0) {
    return error;
  }

  return 'Unknown fetch error';
}

function truncateMessage(message: string): string {
  if (message.length <= UNKNOWN_MESSAGE_MAX_LENGTH) {
    return message;
  }

  return message.slice(0, UNKNOWN_MESSAGE_MAX_LENGTH);
}

function isTooManyRedirects(code: string | undefined, message: string): boolean {
  if (code === 'UND_ERR_TOO_MANY_REDIRECTS' || code === 'ERR_TOO_MANY_REDIRECTS') {
    return true;
  }

  return /too many redirects/i.test(message);
}

/**
 * Maps a fetch failure to a safe CheckOutcome without leaking stack traces.
 */
export function mapFetchError(
  error: unknown,
  httpDurationMs: number | null,
): Extract<CheckOutcome, { kind: 'error' }> {
  const code = unwrapErrorCode(error);
  const rawMessage = readErrorMessage(error);

  if (code !== undefined && DNS_CODES.has(code)) {
    return {
      kind: 'error',
      errorCode: 'DNS_NOT_FOUND',
      errorMessage: 'DNS lookup failed',
      httpDurationMs,
    };
  }

  if (code === 'ECONNREFUSED') {
    return {
      kind: 'error',
      errorCode: 'CONN_REFUSED',
      errorMessage: 'Connection refused',
      httpDurationMs,
    };
  }

  if (code === 'ECONNRESET') {
    return {
      kind: 'error',
      errorCode: 'CONN_RESET',
      errorMessage: 'Connection reset',
      httpDurationMs,
    };
  }

  if (code === 'ETIMEDOUT') {
    return {
      kind: 'error',
      errorCode: 'TIMEOUT',
      errorMessage: 'Connection timed out',
      httpDurationMs,
    };
  }

  if (code !== undefined && TLS_CODES.has(code)) {
    return {
      kind: 'error',
      errorCode: 'TLS_ERROR',
      errorMessage: 'TLS handshake failed',
      httpDurationMs,
    };
  }

  if (isTooManyRedirects(code, rawMessage)) {
    return {
      kind: 'error',
      errorCode: 'TOO_MANY_REDIRECTS',
      errorMessage: 'Too many redirects',
      httpDurationMs,
    };
  }

  return {
    kind: 'error',
    errorCode: 'UNKNOWN',
    errorMessage: truncateMessage(rawMessage),
    httpDurationMs,
  };
}
