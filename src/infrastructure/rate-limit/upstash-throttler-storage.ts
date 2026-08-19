import { ConfigService } from '@nestjs/config';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from '@upstash/redis';

const incrementScript = `#!lua flags=allow-key-locking
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local blockDuration = tonumber(ARGV[4])
local values = redis.call('HMGET', KEYS[1], 'count', 'windowExpires', 'blockedUntil')
local count = tonumber(values[1]) or 0
local windowExpires = tonumber(values[2]) or 0
local blockedUntil = tonumber(values[3]) or 0

if blockedUntil > now then
  return { count, math.max(0, math.ceil((windowExpires - now) / 1000)), 1, math.ceil((blockedUntil - now) / 1000) }
end

if blockedUntil > 0 then
  count = 0
  windowExpires = 0
  blockedUntil = 0
end

if windowExpires <= now then
  count = 0
  windowExpires = now + ttl
end

count = count + 1
if count > limit then
  blockedUntil = now + blockDuration
end

redis.call('HSET', KEYS[1], 'count', count, 'windowExpires', windowExpires, 'blockedUntil', blockedUntil)
redis.call('PEXPIREAT', KEYS[1], math.max(windowExpires, blockedUntil))

return {
  count,
  math.max(0, math.ceil((windowExpires - now) / 1000)),
  blockedUntil > now and 1 or 0,
  blockedUntil > now and math.ceil((blockedUntil - now) / 1000) or 0
}`;

interface RateLimitStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

export class UpstashThrottlerStorage implements ThrottlerStorage {
  private readonly redis: Pick<Redis, 'eval'>;

  constructor(config: ConfigService, redis?: Pick<Redis, 'eval'>) {
    this.redis =
      redis ??
      new Redis({
        url: config.getOrThrow<string>('UPSTASH_REDIS_REST_URL'),
        token: config.getOrThrow<string>('UPSTASH_REDIS_REST_TOKEN'),
        automaticDeserialization: true,
      });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<RateLimitStorageRecord> {
    const storageKey = `ciclera:throttle:${throttlerName}:${key}`;
    const result = await this.redis.eval<number[], number[]>(
      incrementScript,
      [storageKey],
      [Date.now(), ttl, limit, blockDuration],
    );

    if (!isStorageResult(result)) {
      throw new Error('Upstash rate-limit storage returned an invalid result.');
    }

    return {
      totalHits: result[0],
      timeToExpire: result[1],
      isBlocked: result[2] === 1,
      timeToBlockExpire: result[3],
    };
  }
}

function isStorageResult(
  value: unknown,
): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(
      (item) => typeof item === 'number' && Number.isFinite(item) && item >= 0,
    )
  );
}
