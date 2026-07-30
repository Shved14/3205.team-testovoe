import { Global, Module } from '@nestjs/common';

import { AppConfigService } from './config.service';
import { parseEnv } from './env.schema';
import { APP_CONFIG } from './tokens';

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): AppConfigService => new AppConfigService(parseEnv()),
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
