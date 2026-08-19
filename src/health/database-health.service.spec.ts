import { normalizeNodePostgresConnectionString } from './database-health.service';

describe('normalizeNodePostgresConnectionString', () => {
  it('uses libpq semantics for sslmode=require in node-postgres', () => {
    const result = normalizeNodePostgresConnectionString(
      'postgresql://user:password@db.example.com:5432/app?sslmode=require',
    );

    const url = new URL(result);
    expect(url.searchParams.get('sslmode')).toBe('require');
    expect(url.searchParams.get('uselibpqcompat')).toBe('true');
  });

  it('preserves stricter certificate verification modes', () => {
    const result = normalizeNodePostgresConnectionString(
      'postgresql://user:password@db.example.com:5432/app?sslmode=verify-full',
    );

    const url = new URL(result);
    expect(url.searchParams.get('sslmode')).toBe('verify-full');
    expect(url.searchParams.has('uselibpqcompat')).toBe(false);
  });

  it('preserves an explicit compatibility choice', () => {
    const result = normalizeNodePostgresConnectionString(
      'postgresql://user:password@db.example.com:5432/app?sslmode=require&uselibpqcompat=false',
    );

    const url = new URL(result);
    expect(url.searchParams.get('uselibpqcompat')).toBe('false');
  });
});
