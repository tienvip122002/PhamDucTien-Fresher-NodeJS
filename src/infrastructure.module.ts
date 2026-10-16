import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvironmentVariables, validateEnv } from './config/env.validation';
import { redisConnectionFromUrl } from './config/redis';
import { buildDataSourceOptions } from './database/typeorm.config';

/**
 * Config, database and Redis connections.
 * Shared by the HTTP API (main.ts) and the queue worker (worker.ts).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        buildDataSourceOptions({
          DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
          DATABASE_SSL: config.get('DATABASE_SSL', { infer: true }),
        }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => ({
        connection: redisConnectionFromUrl(
          config.get('REDIS_URL', { infer: true }),
        ),
      }),
    }),
  ],
})
export class InfrastructureModule {}
