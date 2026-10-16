import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createServer } from 'http';
import { WorkerModule } from './worker.module';

/**
 * Standalone worker process: consumes the "order-processing" queue.
 * Deployed separately from the API (see README → Deploy).
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  Logger.log('Order worker started', 'Worker');

  // Some hosts (e.g. Render's free web services) only run processes that
  // listen on a port. Setting WORKER_HEALTH_PORT starts a tiny health
  // endpoint for them; it is not needed anywhere else.
  const healthPort = process.env.WORKER_HEALTH_PORT;
  if (healthPort) {
    createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', role: 'order-worker' }));
    }).listen(Number(healthPort));
    Logger.log(`Health endpoint on port ${healthPort}`, 'Worker');
  }
}
void bootstrap();
