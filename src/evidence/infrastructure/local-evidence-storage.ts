import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { EvidenceStorage } from '../application/ports/evidence-storage.port';

@Injectable()
export class LocalEvidenceStorage implements EvidenceStorage {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.getOrThrow<string>('EVIDENCE_STORAGE_ROOT'));
  }

  async putObject(
    objectKey: string,
    content: Buffer,
    metadata: { contentType: string; sizeBytes: number },
  ): Promise<void> {
    if (content.byteLength !== metadata.sizeBytes) {
      throw new Error('Evidence size does not match the intent.');
    }
    const path = this.pathFor(objectKey);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, { flag: 'w', mode: 0o600 });
    await writeFile(`${path}.metadata.json`, JSON.stringify(metadata), {
      flag: 'w',
      mode: 0o600,
    });
  }

  async statObject(objectKey: string) {
    const path = this.pathFor(objectKey);
    try {
      const [file, rawMetadata] = await Promise.all([
        stat(path),
        readFile(`${path}.metadata.json`, 'utf8'),
      ]);
      const metadata = JSON.parse(rawMetadata) as {
        contentType?: unknown;
        sizeBytes?: unknown;
      };
      if (
        typeof metadata.contentType !== 'string' ||
        metadata.sizeBytes !== file.size
      ) {
        return null;
      }
      return { contentType: metadata.contentType, sizeBytes: file.size };
    } catch (error: unknown) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  readObject(objectKey: string) {
    return readFile(this.pathFor(objectKey));
  }

  async deleteObject(objectKey: string): Promise<void> {
    const path = this.pathFor(objectKey);
    await Promise.all([
      rm(path, { force: true }),
      rm(`${path}.metadata.json`, { force: true }),
    ]);
  }

  private pathFor(objectKey: string): string {
    if (!/^[a-zA-Z0-9/_-]+$/.test(objectKey)) {
      throw new Error('Invalid evidence object key.');
    }
    const path = resolve(this.root, objectKey);
    if (path !== this.root && !path.startsWith(`${this.root}${sep}`)) {
      throw new Error('Evidence object key escapes the private root.');
    }
    return path;
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
