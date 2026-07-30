import { Module } from '@nestjs/common';

import type { Clock } from '../common/clock';
import { CommonModule } from '../common/common.module';
import { CLOCK } from '../common/tokens';
import { JobStore } from './job-store';
import { JOB_STORE } from './tokens';

@Module({
  imports: [CommonModule],
  providers: [
    {
      provide: JOB_STORE,
      useFactory: (clock: Clock): JobStore =>
        new JobStore({
          clock,
          startCleanupScheduler: true,
        }),
      inject: [CLOCK],
    },
  ],
  exports: [JOB_STORE],
})
export class JobsModule {}
