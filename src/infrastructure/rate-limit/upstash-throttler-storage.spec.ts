import { ConfigService } from '@nestjs/config';
import { UpstashThrottlerStorage } from './upstash-throttler-storage';

describe('UpstashThrottlerStorage', () => {
  it('maps the atomic Redis result to the Nest throttler contract', async () => {
    const evalCommand = jest.fn().mockResolvedValue([3, 58, 0, 0]);
    const storage = new UpstashThrottlerStorage(new ConfigService(), {
      eval: evalCommand,
    });

    await expect(
      storage.increment('request-key', 60_000, 5, 60_000, 'ip'),
    ).resolves.toEqual({
      totalHits: 3,
      timeToExpire: 58,
      isBlocked: false,
      timeToBlockExpire: 0,
    });

    expect(evalCommand).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('HSET'"),
      ['ciclera:throttle:ip:request-key'],
      expect.arrayContaining([60_000, 5]),
    );
  });

  it('fails closed when the provider returns a malformed value', async () => {
    const storage = new UpstashThrottlerStorage(new ConfigService(), {
      eval: jest.fn().mockResolvedValue(['unexpected']),
    });

    await expect(
      storage.increment('request-key', 60_000, 5, 60_000, 'identifier'),
    ).rejects.toThrow('invalid result');
  });
});
