#!/bin/sh
set -eu

if [ -z "${POSTGRES_TEST_DB:-}" ]; then
  echo "POSTGRES_TEST_DB must be set" >&2
  exit 1
fi

if [ "$POSTGRES_TEST_DB" = "$POSTGRES_DB" ]; then
  echo "POSTGRES_TEST_DB must differ from POSTGRES_DB" >&2
  exit 1
fi

psql --set ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set test_db="$POSTGRES_TEST_DB" <<-'EOSQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'test_db', current_user)
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_database
  WHERE datname = :'test_db'
)\gexec
EOSQL
