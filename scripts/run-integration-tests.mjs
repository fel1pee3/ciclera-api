import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, '..');
const prismaCli = resolve(projectRoot, 'node_modules/prisma/build/index.js');
const jestCli = resolve(projectRoot, 'node_modules/jest/bin/jest.js');
const seedRunner = resolve(projectRoot, 'scripts/run-database-seed.mjs');

const developmentUrlValue = process.env.DATABASE_URL;
const testUrlValue = process.env.TEST_DATABASE_URL;

if (!developmentUrlValue || !testUrlValue) {
  throw new Error('DATABASE_URL and TEST_DATABASE_URL must be set.');
}

const developmentUrl = new URL(developmentUrlValue);
const testUrl = new URL(testUrlValue);
const developmentDatabase = databaseNameFrom(developmentUrl);
const testDatabase = databaseNameFrom(testUrl);
const allowedHosts = new Set(['127.0.0.1', '::1', 'localhost']);

if (
  !allowedHosts.has(developmentUrl.hostname) ||
  !allowedHosts.has(testUrl.hostname)
) {
  throw new Error('Integration tests only accept local database hosts.');
}

if (developmentDatabase === testDatabase) {
  throw new Error(
    'Integration tests require separate development and test databases.',
  );
}

if (
  process.env.POSTGRES_DB &&
  developmentDatabase !== process.env.POSTGRES_DB
) {
  throw new Error('DATABASE_URL must point to POSTGRES_DB.');
}

if (
  process.env.POSTGRES_TEST_DB &&
  testDatabase !== process.env.POSTGRES_TEST_DB
) {
  throw new Error('TEST_DATABASE_URL must point to POSTGRES_TEST_DB.');
}

const testEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  TEST_DATABASE_URL: testUrlValue,
};
const migrationEnvironment = {
  ...testEnvironment,
  DATABASE_URL: testUrlValue,
};

run(prismaCli, ['migrate', 'deploy'], migrationEnvironment);
run(seedRunner, ['test'], testEnvironment);
run(seedRunner, ['test'], testEnvironment);
run(
  jestCli,
  ['--config', './test/jest-integration.json', '--runInBand'],
  testEnvironment,
);

function databaseNameFrom(url) {
  const databaseName = decodeURIComponent(url.pathname.slice(1));

  if (!databaseName) {
    throw new Error('Database URLs must include a database name.');
  }

  return databaseName;
}

function run(executable, args, environment) {
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd: projectRoot,
    env: environment,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
