import { sleep } from './sleep';

export interface SleepService {
  wait(ms: number, signal: AbortSignal): Promise<boolean>;
}

export class SystemSleepService implements SleepService {
  wait(ms: number, signal: AbortSignal): Promise<boolean> {
    return sleep(ms, signal);
  }
}
