import { Injectable } from '@nestjs/common';
import { SessionResolver } from '../application/ports/session-resolver.port';

@Injectable()
export class UnavailableSessionResolver implements SessionResolver {
  resolveSession(): Promise<null> {
    return Promise.resolve(null);
  }
}
