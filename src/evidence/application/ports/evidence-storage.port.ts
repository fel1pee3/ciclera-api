export const EVIDENCE_STORAGE = Symbol('EVIDENCE_STORAGE');

export interface StoredEvidenceMetadata {
  contentType: string;
  sizeBytes: number;
}

export interface EvidenceStorage {
  putObject(
    objectKey: string,
    content: Buffer,
    metadata: StoredEvidenceMetadata,
  ): Promise<void>;
  statObject(objectKey: string): Promise<StoredEvidenceMetadata | null>;
  readObject(objectKey: string): Promise<Buffer>;
  deleteObject(objectKey: string): Promise<void>;
}
