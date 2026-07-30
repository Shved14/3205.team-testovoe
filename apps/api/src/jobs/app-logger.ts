export interface AppLogger {
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
}

export class SilentLogger implements AppLogger {
  error(_message: string, _context?: Record<string, unknown>): void {}
  warn(_message: string, _context?: Record<string, unknown>): void {}
  info(_message: string, _context?: Record<string, unknown>): void {}
}
