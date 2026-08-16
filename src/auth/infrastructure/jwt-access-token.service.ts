import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { readEnvironment } from '../../config/environment';
import { ResolvedSession } from '../application/ports/session-resolver.port';
import { AccessTokenService } from '../application/ports/token-services.port';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class JwtAccessTokenService implements AccessTokenService {
  private readonly configuration;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.configuration = readEnvironment(configService);
  }

  issue(session: ResolvedSession): Promise<string> {
    return this.jwtService.signAsync(
      {
        sid: session.sessionId,
        oid: session.organizationId,
      },
      {
        secret: this.configuration.JWT_ACCESS_SECRET,
        algorithm: 'HS256',
        expiresIn: this.configuration.ACCESS_TOKEN_TTL,
        issuer: this.configuration.JWT_ACCESS_ISSUER,
        audience: this.configuration.JWT_ACCESS_AUDIENCE,
        subject: session.userId,
      },
    );
  }

  async verify(token: string): Promise<ResolvedSession | null> {
    try {
      const payload = await this.jwtService.verifyAsync<
        Record<string, unknown>
      >(token, {
        secret: this.configuration.JWT_ACCESS_SECRET,
        algorithms: ['HS256'],
        issuer: this.configuration.JWT_ACCESS_ISSUER,
        audience: this.configuration.JWT_ACCESS_AUDIENCE,
      });

      if (!isRecord(payload)) {
        return null;
      }

      const sessionId = payload.sid;
      const userId = payload.sub;
      const organizationId = payload.oid;

      if (!isUuid(sessionId) || !isUuid(userId) || !isUuid(organizationId)) {
        return null;
      }

      return { sessionId, userId, organizationId };
    } catch {
      return null;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}
