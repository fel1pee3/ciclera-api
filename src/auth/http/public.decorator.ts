import { SetMetadata } from '@nestjs/common';

export const publicRouteMetadataKey = 'auth:public-route';

export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(publicRouteMetadataKey, true);
