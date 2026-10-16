import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

/**
 * Standalone worker process: consumes the "order-processing" queue.
 * Deployed separately from the API (see README → Deploy).
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  Logger.log('Order worker started', 'Worker');
}
void bootstrap();
