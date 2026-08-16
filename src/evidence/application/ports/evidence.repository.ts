export const EVIDENCE_REPOSITORY = Symbol('EVIDENCE_REPOSITORY');

export type EvidenceKind = 'PHOTO' | 'SIGNATURE';
export type EvidenceStatus = 'PENDING' | 'AVAILABLE';

export interface EvidenceRecord {
  id: string;
  workOrderId: string;
  executionId: string;
  kind: EvidenceKind;
  status: EvidenceStatus;
  objectKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: bigint;
  confirmedAt: Date | null;
  createdAt: Date;
}

export type EvidenceMutationResult =
  | { status: 'SUCCESS'; evidence: EvidenceRecord }
  | { status: 'NOT_FOUND' }
  | { status: 'STATUS_LOCKED' }
  | { status: 'VERSION_CONFLICT' }
  | { status: 'LIMIT_EXCEEDED' }
  | { status: 'OBJECT_MISMATCH' };

export interface EvidenceRepository {
  createIntent(input: {
    organizationId: string;
    technicianId: string;
    workOrderId: string;
    expectedVersion: number;
    requestId: string;
    kind: EvidenceKind;
    objectKey: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    maxFiles: number;
  }): Promise<EvidenceMutationResult>;
  findAuthorized(input: {
    organizationId: string;
    technicianId: string;
    evidenceId: string;
    statuses?: EvidenceStatus[];
  }): Promise<EvidenceRecord | null>;
  findForManager(input: {
    organizationId: string;
    evidenceId: string;
    statuses?: EvidenceStatus[];
  }): Promise<EvidenceRecord | null>;
  confirm(input: {
    organizationId: string;
    technicianId: string;
    workOrderId: string;
    evidenceId: string;
    expectedVersion: number;
    requestId: string;
    actualContentType: string;
    actualSizeBytes: number;
  }): Promise<EvidenceMutationResult>;
  remove(input: {
    organizationId: string;
    technicianId: string;
    workOrderId: string;
    evidenceId: string;
    expectedVersion: number;
    requestId: string;
  }): Promise<EvidenceMutationResult>;
}
