export type CheckOutcome =
  | {
      kind: 'success';
      httpStatus: number;
      finalUrl: string;
      redirected: boolean;
      httpDurationMs: number;
    }
  | {
      kind: 'http_error';
      httpStatus: number;
      finalUrl: string;
      redirected: boolean;
      errorCode: 'HTTP_ERROR';
      errorMessage: string;
      httpDurationMs: number;
    }
  | {
      kind: 'error';
      errorCode: string;
      errorMessage: string;
      httpDurationMs: number | null;
    }
  | {
      kind: 'aborted';
    };

export interface UrlChecker {
  check(url: string, signal: AbortSignal): Promise<CheckOutcome>;
}
