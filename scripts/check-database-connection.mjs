import pg from 'pg';

const { Client } = pg;

const targets = {
  development: {
    databaseNameVariable: 'POSTGRES_DB',
    urlVariable: 'DATABASE_URL',
  },
  test: {
    databaseNameVariable: 'POSTGRES_TEST_DB',
    urlVariable: 'TEST_DATABASE_URL',
  },
};

const targetName = process.argv[2] ?? 'development';
const target = targets[targetName];

if (!target) {
  throw new Error('Database target must be either "development" or "test".');
}

const connectionString = process.env[target.urlVariable];
const expectedDatabaseName = process.env[target.databaseNameVariable];
const developmentDatabaseName = process.env.POSTGRES_DB;
const testDatabaseName = process.env.POSTGRES_TEST_DB;

if (!connectionString || !expectedDatabaseName) {
  throw new Error(
    `${target.urlVariable} and ${target.databaseNameVariable} must be set.`,
  );
}

if (
  !developmentDatabaseName ||
  !testDatabaseName ||
  developmentDatabaseName === testDatabaseName
) {
  throw new Error('Development and test databases must have different names.');
}

const databaseUrl = new URL(connectionString);
const allowedHosts = new Set(['127.0.0.1', '::1', 'localhost']);

if (!allowedHosts.has(databaseUrl.hostname)) {
  throw new Error('The CP-02 database check only accepts local hosts.');
}

const databaseNameFromUrl = decodeURIComponent(databaseUrl.pathname.slice(1));

if (databaseNameFromUrl !== expectedDatabaseName) {
  throw new Error(
    `${target.urlVariable} must point to ${target.databaseNameVariable}.`,
  );
}

const client = new Client({
  connectionString,
  connectionTimeoutMillis: 5_000,
});

try {
  await client.connect();

  const result = await client.query(
    'SELECT current_database() AS database_name, current_user AS user_name',
  );
  const connection = result.rows[0];

  if (connection?.database_name !== expectedDatabaseName) {
    throw new Error(`Connected to an unexpected ${targetName} database.`);
  }

  const port = databaseUrl.port || '5432';
  console.log(
    `Connected to ${targetName} database "${connection.database_name}" as "${connection.user_name}" at ${databaseUrl.hostname}:${port}.`,
  );
} finally {
  await client.end();
}
