import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, '..');
const prismaCli = resolve(projectRoot, 'node_modules/prisma/build/index.js');
const jestCli = resolve(projectRoot, 'node_modules/jest/bin/jest.js');
const seedRunner = resolve(projectRoot, 'scripts/run-database-seed.mjs');
const suiteName = process.argv[2];
const suites = {
  e2e: { config: './test/jest-e2e.json', seed: false },
  integration: { config: './test/jest-integration.json', seed: true },
};
const suite = suites[suiteName];

if (!suite) {
  throw new Error('Database test suite must be either "e2e" or "integration".');
}

const databaseUrlValue = process.env.DATABASE_URL;

if (!databaseUrlValue) {
  throw new Error('DATABASE_URL must be set.');
}

const databaseUrl = validateLocalDatabaseUrl(databaseUrlValue);
const databaseName = databaseNameFrom(databaseUrl);

if (process.env.POSTGRES_DB && databaseName !== process.env.POSTGRES_DB) {
  throw new Error('DATABASE_URL must point to POSTGRES_DB.');
}

const configuredSchema = databaseUrl.searchParams.get('schema');

if (configuredSchema && configuredSchema !== 'public') {
  throw new Error('DATABASE_URL must use the public schema.');
}

const schemaName = [
  'ciclera_test',
  suiteName,
  process.pid,
  randomBytes(4).toString('hex'),
].join('_');
const testDatabaseUrl = new URL(databaseUrl);
testDatabaseUrl.searchParams.set('schema', schemaName);

const testEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  TEST_DATABASE_URL: testDatabaseUrl.toString(),
};
const migrationEnvironment = {
  ...testEnvironment,
  DATABASE_URL: testDatabaseUrl.toString(),
};

class CommandFailedError extends Error {
  constructor(exitCode) {
    super(`Database test command failed with exit code ${exitCode}.`);
    this.exitCode = exitCode;
  }
}

let exitCode = 0;

try {
  await createSchema(databaseUrl.toString(), schemaName);
  run(prismaCli, ['migrate', 'deploy'], migrationEnvironment);

  if (suite.seed) {
    run(seedRunner, ['test'], testEnvironment);
    run(seedRunner, ['test'], testEnvironment);
  }

  run(
    jestCli,
    ['--config', suite.config, '--runInBand', ...process.argv.slice(3)],
    testEnvironment,
  );
} catch (error) {
  if (error instanceof CommandFailedError) {
    exitCode = error.exitCode;
  } else {
    throw error;
  }
} finally {
  await dropSchema(databaseUrl.toString(), schemaName);
}

process.exitCode = exitCode;

function validateLocalDatabaseUrl(value) {
  const url = new URL(value);
  const allowedHosts = new Set(['127.0.0.1', '::1', 'localhost']);

  if (
    (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') ||
    !allowedHosts.has(url.hostname)
  ) {
    throw new Error('Database tests only accept a local PostgreSQL URL.');
  }

  return url;
}

function databaseNameFrom(url) {
  const databaseName = decodeURIComponent(url.pathname.slice(1));

  if (!databaseName) {
    throw new Error('DATABASE_URL must include a database name.');
  }

  return databaseName;
}

async function createSchema(connectionString, schemaName) {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
  } finally {
    await client.end();
  }
}

async function dropSchema(connectionString, schemaName) {
  if (!/^ciclera_test_[a-z0-9_]+$/.test(schemaName)) {
    throw new Error('Refusing to drop an unexpected database schema.');
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query(
      `DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`,
    );
  } finally {
    await client.end();
  }
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
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
    throw new CommandFailedError(result.status ?? 1);
  }
}
