import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  EvidenceStorage,
  StoredEvidenceMetadata,
} from '../application/ports/evidence-storage.port';

@Injectable()
export class SupabaseEvidenceStorage implements EvidenceStorage {
  private readonly bucket: string;
  private readonly client: SupabaseClient;

  constructor(config: ConfigService, client?: SupabaseClient) {
    this.bucket = config.getOrThrow<string>('SUPABASE_STORAGE_BUCKET');
    this.client =
      client ??
      createClient(
        config.getOrThrow<string>('SUPABASE_URL'),
        config.getOrThrow<string>('SUPABASE_SECRET_KEY'),
        {
          auth: {
            autoRefreshToken: false,
            detectSessionInUrl: false,
            persistSession: false,
          },
        },
      );
  }

  async putObject(
    objectKey: string,
    content: Buffer,
    metadata: StoredEvidenceMetadata,
  ): Promise<void> {
    assertObjectKey(objectKey);
    if (content.byteLength !== metadata.sizeBytes) {
      throw new Error('Evidence size does not match the intent.');
    }

    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(objectKey, content, {
        cacheControl: '0',
        contentType: metadata.contentType,
        metadata: {
          contentType: metadata.contentType,
          sizeBytes: metadata.sizeBytes,
        },
        upsert: true,
      });

    if (error) throw storageOperationError('upload', error);
  }

  async statObject(objectKey: string): Promise<StoredEvidenceMetadata | null> {
    assertObjectKey(objectKey);
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .info(objectKey);

    if (error) {
      if (isNotFound(error)) return null;
      throw storageOperationError('metadata lookup', error);
    }

    if (
      typeof data.size !== 'number' ||
      !Number.isSafeInteger(data.size) ||
      data.size < 0 ||
      typeof data.contentType !== 'string' ||
      data.contentType.length === 0
    ) {
      return null;
    }

    return { contentType: data.contentType, sizeBytes: data.size };
  }

  async readObject(objectKey: string): Promise<Buffer> {
    assertObjectKey(objectKey);
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .download(objectKey, {}, { cache: 'no-store' });

    if (error) throw storageOperationError('download', error);
    return Buffer.from(await data.arrayBuffer());
  }

  async deleteObject(objectKey: string): Promise<void> {
    assertObjectKey(objectKey);
    const { error } = await this.client.storage
      .from(this.bucket)
      .remove([objectKey]);

    if (error && !isNotFound(error)) {
      throw storageOperationError('deletion', error);
    }
  }
}

function assertObjectKey(objectKey: string): void {
  if (!/^[a-zA-Z0-9/_-]+$/.test(objectKey)) {
    throw new Error('Invalid evidence object key.');
  }
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const status = 'status' in error ? error.status : undefined;
  const statusCode = 'statusCode' in error ? error.statusCode : undefined;
  return status === 404 || statusCode === '404' || statusCode === 404;
}

function storageOperationError(operation: string, cause: unknown): Error {
  return new Error(`Supabase evidence storage ${operation} failed.`, { cause });
}
