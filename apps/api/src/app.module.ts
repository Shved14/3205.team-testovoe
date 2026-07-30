import { Module } from '@nestjs/common';

import { CheckerModule } from './checker/checker.module';
import { CommonModule } from './common/common.module';

@Module({
  imports: [CommonModule, CheckerModule],
})
export class AppModule {}
