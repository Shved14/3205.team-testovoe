import { Module } from '@nestjs/common';

import { CheckerModule } from './checker/checker.module';
import { CommonModule } from './common/common.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [CommonModule, CheckerModule, JobsModule],
})
export class AppModule {}
