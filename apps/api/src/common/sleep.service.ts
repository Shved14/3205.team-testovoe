import { sleep } from './sleep';

export interface SleepService {
  sleep(ms: number, signal: AbortSignal): Promise<boolean>;
}

export class SystemSleepService implements SleepService {
  sleep(ms: number, signal: AbortSignal): Promise<boolean> {
    return sleep(ms, signal);
  }
}
