import { HEADERS_METADATA } from '@nestjs/common/constants';
import { EvidenceController } from './evidence.controller';
import { ReviewEvidenceController } from './review-evidence.controller';

type ResponseHeader = {
  name: string;
  value: string;
};

describe('evidence response headers', () => {
  it.each([
    ['technician', EvidenceController.prototype],
    ['reviewer', ReviewEvidenceController.prototype],
  ])(
    'allows the %s signed content response to be embedded by the web app',
    (_scope, prototype) => {
      // PropertyDescriptor.value is typed as any by TypeScript's standard library.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const handler = Object.getOwnPropertyDescriptor(prototype, 'read')?.value;
      const headers = Reflect.getMetadata(
        HEADERS_METADATA,
        handler as object,
      ) as ResponseHeader[] | undefined;

      expect(headers).toEqual(
        expect.arrayContaining([
          {
            name: 'Cross-Origin-Resource-Policy',
            value: 'cross-origin',
          },
          { name: 'Cache-Control', value: 'private, no-store' },
        ]),
      );
    },
  );
});
