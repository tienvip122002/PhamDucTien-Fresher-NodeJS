import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Request, Response } from 'express';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';

/**
 * Vercel entry point (see api/index.js and vercel.json).
 *
 * Vercel runs the API as a serverless function: an instance may be frozen
 * between requests and is never running in the background. That is fine for
 * the HTTP API (it only adds jobs to the queue) but not for the BullMQ
 * worker, which needs a long-running process — so the worker is deployed
 * separately (src/worker.ts).
 *
 * The Nest app is created once per function instance and reused by later
 * requests (warm starts).
 */
let server: express.Express | undefined;

async function getServer(): Promise<express.Express> {
  if (!server) {
    const expressApp = express();
    const app = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressApp),
    );
    setupApp(app);
    await app.init();
    server = expressApp;
  }
  return server;
}

export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const app = await getServer();
  app(req, res);
}
