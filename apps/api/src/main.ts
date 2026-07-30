import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import type { AppConfigService } from './config/config.service';
import { APP_CONFIG } from './config/tokens';
import { DomainExceptionFilter } from './http/domain-exception.filter';
import type { AppLogger } from './jobs/app-logger';
import { APP_LOGGER } from './jobs/tokens';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const config = app.get<AppConfigService>(APP_CONFIG);
  const logger = app.get<AppLogger>(APP_LOGGER);

  app.useGlobalFilters(new DomainExceptionFilter(logger));
  app.enableShutdownHooks();

  if (config.isDevelopment && config.corsOrigin !== undefined) {
    app.enableCors({
      origin: config.corsOrigin,
    });
  }

  await app.listen(config.port);
  logger.info('API started', {
    port: config.port,
    nodeEnv: config.nodeEnv,
  });
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown bootstrap error';
  // Startup failures happen before DI logger is available.
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
