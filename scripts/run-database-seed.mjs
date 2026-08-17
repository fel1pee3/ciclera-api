import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const target = process.argv[2];

if (target !== 'test') {
  throw new Error('Seed is reserved for isolated automated tests.');
}

if (process.env.NODE_ENV === 'production') {
  throw new Error('Database seed is disabled in production.');
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, '..');
const seedFile = resolve(projectRoot, 'prisma/seed.ts');
const result = spawnSync(
  process.execPath,
  ['-r', 'ts-node/register', seedFile],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
    stdio: 'inherit',
  },
);

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
