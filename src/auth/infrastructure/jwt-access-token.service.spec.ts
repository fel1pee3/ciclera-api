import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { validateEnvironment } from '../../config/environment';
import { ResolvedSession } from '../application/ports/session-resolver.port';
import { JwtAccessTokenService } from './jwt-access-token.service';

const session: ResolvedSession = {
  sessionId: '30000000-0000-4000-8000-000000000001',
  userId: '30000000-0000-4000-8000-000000000101',
  organizationId: '30000000-0000-4000-8000-000000000010',
};

const rawEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:password@localhost:55432/ciclera_dev',
  TEST_DATABASE_URL: 'postgresql://user:password@localhost:55432/ciclera_test',
  WEB_URL: 'http://localhost:3000',
  CORS_ORIGINS: 'http://localhost:3000',
  JWT_ACCESS_SECRET: 'test-only-access-secret-with-at-least-32-characters',
  JWT_ACCESS_ISSUER: 'ciclera-api-test',
  JWT_ACCESS_AUDIENCE: 'ciclera-web-test',
  ACCESS_TOKEN_TTL: '900',
  REFRESH_TOKEN_TTL: '2592000',
};

describe('JwtAccessTokenService', () => {
  const jwt = new JwtService();
  const environment = validateEnvironment(rawEnvironment);
  const service = new JwtAccessTokenService(
    jwt,
    new ConfigService(environment),
  );

  it('issues and validates only the trusted session claims', async () => {
    const token = await service.issue(session);

    await expect(service.verify(token)).resolves.toEqual(session);
  });

  it('rejects a tampered signature', async () => {
    const token = await service.issue(session);
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;

    await expect(service.verify(tampered)).resolves.toBeNull();
  });

  it.each([
    ['issuer', { issuer: 'another-issuer' }],
    ['audience', { audience: 'another-audience' }],
    ['algorithm', { algorithm: 'HS384' as const }],
    ['expiration', { expiresIn: -1 }],
  ])('rejects a token with an invalid %s', async (_name, overrides) => {
    const token = await jwt.signAsync(
      { sid: session.sessionId, oid: session.organizationId },
      {
        secret: environment.JWT_ACCESS_SECRET,
        algorithm: 'HS256',
        expiresIn: environment.ACCESS_TOKEN_TTL,
        issuer: environment.JWT_ACCESS_ISSUER,
        audience: environment.JWT_ACCESS_AUDIENCE,
        subject: session.userId,
        ...overrides,
      },
    );

    await expect(service.verify(token)).resolves.toBeNull();
  });
});
