import { sanitizeLogValue } from './structured-logger.service';

describe('sanitizeLogValue', () => {
  it('redacts credentials, cookies, tokens and signed URLs', () => {
    const serialized = JSON.stringify(
      sanitizeLogValue({
        Authorization: 'Bearer private-token',
        Cookie: 'session=private-cookie',
        'Set-Cookie': 'session=private-cookie',
        password: 'private-password',
        nested: { refreshToken: 'private-refresh-token' },
        signedUrl:
          'https://storage.example/file?X-Amz-Signature=private-signature',
        databaseUrl:
          'postgresql://private-user:private-password@localhost/database',
      }),
    );

    expect(serialized).not.toContain('private-token');
    expect(serialized).not.toContain('private-cookie');
    expect(serialized).not.toContain('private-password');
    expect(serialized).not.toContain('private-refresh-token');
    expect(serialized).not.toContain('private-signature');
    expect(serialized).not.toContain('private-user');
    expect(serialized).toContain('[REDACTED]');
  });
});
