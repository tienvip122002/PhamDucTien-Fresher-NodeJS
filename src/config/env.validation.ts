import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

/**
 * All environment variables the app reads, with defaults.
 * The app refuses to start if a value is missing or invalid.
 */
export class EnvironmentVariables {
  @IsInt()
  PORT = 3000;

  @IsString()
  DATABASE_URL!: string;

  @IsIn(['true', 'false'])
  DATABASE_SSL = 'false';

  @IsString()
  REDIS_URL!: string;

  /** Total attempts for one order-processing job (first run + retries). */
  @IsInt()
  @Min(1)
  ORDER_JOB_ATTEMPTS = 3;

  /** Base delay for exponential backoff: 1s, 2s, 4s... */
  @IsInt()
  @Min(0)
  ORDER_JOB_BACKOFF_MS = 1000;

  /** Probability (0..1) that the simulated processing step fails. */
  @IsNumber()
  @Min(0)
  @Max(1)
  ORDER_FAILURE_RATE = 0.3;

  @IsInt()
  @Min(0)
  ORDER_PROCESSING_MIN_MS = 3000;

  @IsInt()
  @Min(0)
  ORDER_PROCESSING_MAX_MS = 5000;

  /** PENDING orders older than this are cancelled by the cleanup job. */
  @IsInt()
  @Min(1)
  PENDING_ORDER_TTL_MINUTES = 30;

  @IsInt()
  @Min(1000)
  CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

  @IsInt()
  @Min(1)
  WORKER_CONCURRENCY = 5;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated);
  if (errors.length > 0) {
    throw new Error(`Invalid environment variables:\n${errors.toString()}`);
  }
  return validated;
}
