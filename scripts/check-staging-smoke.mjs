const apiOrigin = requiredHttpsOrigin('STAGING_API_URL');
const webOrigin = requiredHttpsOrigin('STAGING_WEB_URL');

const [live, ready, docs, cors, web] = await Promise.all([
  get(new URL('/health/live', apiOrigin)),
  get(new URL('/health/ready', apiOrigin)),
  get(new URL('/docs-json', apiOrigin)),
  fetch(new URL('/health/live', apiOrigin), {
    method: 'OPTIONS',
    headers: {
      Origin: webOrigin,
      'Access-Control-Request-Method': 'GET',
    },
    signal: AbortSignal.timeout(10_000),
  }),
  get(new URL('/', webOrigin)),
]);

await expectHealth(live, 'liveness');
await expectHealth(ready, 'readiness');
if (docs.status !== 404) fail('Swagger must not be public in staging.');
if (
  cors.status !== 204 ||
  cors.headers.get('access-control-allow-origin') !== webOrigin ||
  cors.headers.get('access-control-allow-credentials') !== 'true'
) {
  fail(
    'Staging CORS does not allow the configured web origin with credentials.',
  );
}
if (!live.headers.has('x-request-id') || !ready.headers.has('x-request-id')) {
  fail('Health responses must include x-request-id.');
}
if (
  live.headers.get('x-content-type-options') !== 'nosniff' ||
  !live.headers.has('strict-transport-security')
) {
  fail('Expected production security headers are missing.');
}
if (!web.ok) fail(`Staging web returned HTTP ${web.status}.`);
const html = await web.text();
for (const marker of [
  'LEAD_WEBHOOK_URL',
  'JWT_ACCESS_SECRET',
  'DATABASE_URL',
  'postgresql://',
]) {
  if (html.includes(marker))
    fail(`Private marker ${marker} found in web HTML.`);
}

console.log('Staging public smoke checks passed without printing credentials.');

async function get(url) {
  return fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
}

async function expectHealth(response, label) {
  if (!response.ok) fail(`Staging ${label} returned HTTP ${response.status}.`);
  const body = await response.json().catch(() => null);
  if (!body || typeof body !== 'object' || body.status !== 'ok') {
    fail(`Staging ${label} returned an invalid body.`);
  }
}

function requiredHttpsOrigin(name) {
  const value = process.env[name];
  if (!value) fail(`${name} is required.`);
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${name} must be a valid HTTPS origin.`);
  }
  if (
    url.protocol !== 'https:' ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    fail(`${name} must be an HTTPS origin without path or credentials.`);
  }
  return url.origin;
}

function fail(message) {
  throw new Error(message);
}
