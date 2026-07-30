import { Module } from '@nestjs/common';

import { SystemClock } from './clock';
import { SystemRandomService } from './random.service';
import { SystemSleepService } from './sleep.service';
import { CLOCK, RANDOM_SERVICE, SLEEP_SERVICE } from './tokens';

@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: RANDOM_SERVICE, useClass: SystemRandomService },
    { provide: SLEEP_SERVICE, useClass: SystemSleepService },
  ],
  exports: [CLOCK, RANDOM_SERVICE, SLEEP_SERVICE],
})
export class CommonModule {}
