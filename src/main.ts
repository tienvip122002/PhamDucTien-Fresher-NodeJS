import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';
import { EnvironmentVariables } from './config/env.validation';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupApp(app);

  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  if (config.get('RUN_WORKER', { infer: true }) === 'true') {
    // Same process, separate Nest context: handy for local development.
    // In production the worker runs on its own (npm run start:worker).
    const worker = await NestFactory.createApplicationContext(WorkerModule);
    worker.enableShutdownHooks();
    Logger.log('Order worker started in the API process', 'Bootstrap');
  }
  Logger.log(
    `API ready on http://localhost:${port} (docs: /api/docs)`,
    'Bootstrap',
  );
}
void bootstrap();
