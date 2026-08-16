import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDirectory, '..');
const expectedEntrypoint = resolve(projectRoot, 'dist/main.js');
const forbiddenOutputs = [
  resolve(projectRoot, 'dist/src/main.js'),
  resolve(projectRoot, 'dist/prisma'),
  resolve(projectRoot, 'dist/test'),
];

await assertRegularFile(expectedEntrypoint);

for (const forbiddenOutput of forbiddenOutputs) {
  if (await exists(forbiddenOutput)) {
    throw new Error(
      `Production build contains an unexpected output: ${forbiddenOutput}`,
    );
  }
}

process.stdout.write('Production build artifact verified at dist/main.js.\n');

async function assertRegularFile(filePath) {
  await access(filePath, constants.R_OK);
  const metadata = await stat(filePath);

  if (!metadata.isFile()) {
    throw new Error(`Production entrypoint is not a file: ${filePath}`);
  }
}

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
