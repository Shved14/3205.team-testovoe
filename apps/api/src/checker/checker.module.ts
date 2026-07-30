import { Module } from '@nestjs/common';

import type { Clock } from '../common/clock';
import { CommonModule } from '../common/common.module';
import { CLOCK } from '../common/tokens';
import { FetchUrlChecker } from './fetch-url-checker';
import { URL_CHECKER } from './tokens';
import type { UrlChecker } from './url-checker';

@Module({
  imports: [CommonModule],
  providers: [
    {
      provide: URL_CHECKER,
      useFactory: (clock: Clock): UrlChecker => new FetchUrlChecker(clock),
      inject: [CLOCK],
    },
  ],
  exports: [URL_CHECKER],
})
export class CheckerModule {}
