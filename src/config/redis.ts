import type { ConnectionOptions } from 'bullmq';

/**
 * Turns a REDIS_URL (redis:// or rediss:// for TLS, e.g. Upstash)
 * into the connection options BullMQ expects.
 */
export function redisConnectionFromUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0;

  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
    // Required by BullMQ workers: blocking commands must not be retried by ioredis.
    maxRetriesPerRequest: null,
  };
}
