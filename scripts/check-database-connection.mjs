import pg from 'pg';

const { Client } = pg;

const connectionString = process.env.DATABASE_URL;
const expectedDatabaseName = process.env.POSTGRES_DB;

if (!connectionString || !expectedDatabaseName) {
  throw new Error('DATABASE_URL and POSTGRES_DB must be set.');
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
    throw new Error('Connected to an unexpected local database.');
  }

  const port = databaseUrl.port || '5432';
  console.log(
    `Connected to local database "${connection.database_name}" as "${connection.user_name}" at ${databaseUrl.hostname}:${port}.`,
  );
} finally {
  await client.end();
}
