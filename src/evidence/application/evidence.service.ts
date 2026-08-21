import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import {
  WorkOrderNotFoundError,
  WorkOrderStatusLockedError,
  WorkOrderVersionConflictError,
} from '../../work-orders/domain/work-order.errors';
import { TechnicianWorkOrdersService } from '../../work-orders/application/technician-work-orders.service';
import {
  EvidenceLimitExceededError,
  EvidenceNotFoundError,
  EvidenceObjectMismatchError,
  EvidenceTokenInvalidError,
  EvidenceTypeInvalidError,
} from '../domain/evidence.errors';
import {
  hasValidEvidenceFileName,
  hasValidEvidenceSignature,
} from '../domain/evidence-file';
import { EvidenceTokenService } from '../infrastructure/evidence-token.service';
import {
  EVIDENCE_REPOSITORY,
  type EvidenceMutationResult,
  type EvidenceRepository,
} from './ports/evidence.repository';
import {
  EVIDENCE_STORAGE,
  type EvidenceStorage,
} from './ports/evidence-storage.port';
import { SubscriptionEntitlementsService } from '../../subscriptions/application/subscription-entitlements.service';

@Injectable()
export class EvidenceService {
  private readonly maxSize: number;
  private readonly maxFiles: number;
  private readonly allowedTypes: string[];

  constructor(
    @Inject(EVIDENCE_REPOSITORY) private readonly evidence: EvidenceRepository,
    @Inject(EVIDENCE_STORAGE) private readonly storage: EvidenceStorage,
    private readonly tokens: EvidenceTokenService,
    private readonly workOrders: TechnicianWorkOrdersService,
    private readonly entitlements: SubscriptionEntitlementsService,
    config: ConfigService,
  ) {
    this.maxSize = config.getOrThrow<number>('UPLOAD_MAX_FILE_SIZE_BYTES');
    this.maxFiles = config.getOrThrow<number>('UPLOAD_MAX_FILES_PER_EXECUTION');
    this.allowedTypes = config.getOrThrow<string[]>(
      'UPLOAD_ALLOWED_MIME_TYPES',
    );
  }

  async createIntent(
    principal: AuthenticatedPrincipal,
    requestId: string,
    workOrderId: string,
    input: {
      version: number;
      kind: 'PHOTO' | 'SIGNATURE';
      fileName: string;
      contentType: string;
      sizeBytes: number;
    },
  ) {
    const contentType = input.contentType.toLowerCase();
    if (
      !this.allowedTypes.includes(contentType) ||
      !hasValidEvidenceFileName(input.fileName, contentType) ||
      input.sizeBytes < 1 ||
      input.sizeBytes > this.maxSize
    ) {
      throw new EvidenceTypeInvalidError();
    }
    await this.entitlements.assertEvidenceStorage(
      principal.organizationId,
      input.sizeBytes,
    );
    const objectKey = `${principal.organizationId}/${workOrderId}/${randomUUID()}`;
    const result = await this.evidence.createIntent({
      organizationId: principal.organizationId,
      technicianId: principal.userId,
      workOrderId,
      expectedVersion: input.version,
      requestId,
      kind: input.kind,
      objectKey,
      fileName: input.fileName.trim(),
      contentType,
      sizeBytes: input.sizeBytes,
      maxFiles: this.maxFiles,
    });
    const record = resolveMutation(result);
    const capability = this.tokens.issue('upload', record.id, record.objectKey);
    return {
      workOrder: await this.workOrders.find(principal, workOrderId),
      intent: {
        evidenceId: record.id,
        uploadUrl: `field/evidence/${record.id}/upload?token=${encodeURIComponent(capability.token)}`,
        expiresAt: capability.expiresAt,
        method: 'PUT' as const,
        contentType: record.contentType,
      },
    };
  }

  async upload(
    principal: AuthenticatedPrincipal,
    evidenceId: string,
    token: string,
    contentType: string,
    content: Buffer,
  ) {
    const record = await this.authorized(principal, evidenceId, ['PENDING']);
    if (
      !this.tokens.verify(token, 'upload', record.id, record.objectKey) ||
      record.contentType !== contentType.toLowerCase() ||
      !hasValidEvidenceSignature(content, record.contentType) ||
      Number(record.sizeBytes) !== content.byteLength ||
      content.byteLength > this.maxSize
    ) {
      throw new EvidenceTokenInvalidError();
    }
    await this.storage.putObject(record.objectKey, content, {
      contentType: record.contentType,
      sizeBytes: content.byteLength,
    });
  }

  async confirm(
    principal: AuthenticatedPrincipal,
    requestId: string,
    workOrderId: string,
    evidenceId: string,
    version: number,
  ) {
    const record = await this.authorized(principal, evidenceId);
    const metadata = await this.storage.statObject(record.objectKey);
    if (!metadata) throw new EvidenceObjectMismatchError();
    resolveMutation(
      await this.evidence.confirm({
        organizationId: principal.organizationId,
        technicianId: principal.userId,
        workOrderId,
        evidenceId,
        expectedVersion: version,
        requestId,
        actualContentType: metadata.contentType,
        actualSizeBytes: metadata.sizeBytes,
      }),
    );
    return this.workOrders.find(principal, workOrderId);
  }

  async readUrl(principal: AuthenticatedPrincipal, evidenceId: string) {
    const record = await this.authorized(principal, evidenceId, ['AVAILABLE']);
    const capability = this.tokens.issue('read', record.id, record.objectKey);
    return {
      url: `field/evidence/${record.id}/content?token=${encodeURIComponent(capability.token)}`,
      expiresAt: capability.expiresAt,
    };
  }

  async read(
    principal: AuthenticatedPrincipal,
    evidenceId: string,
    token: string,
  ) {
    const record = await this.authorized(principal, evidenceId, ['AVAILABLE']);
    if (!this.tokens.verify(token, 'read', record.id, record.objectKey)) {
      throw new EvidenceTokenInvalidError();
    }
    return { record, content: await this.storage.readObject(record.objectKey) };
  }

  async readUrlForManager(
    principal: AuthenticatedPrincipal,
    evidenceId: string,
  ) {
    const record = await this.managerAuthorized(principal, evidenceId);
    const capability = this.tokens.issue('read', record.id, record.objectKey);
    return {
      url: `reviews/evidence/${record.id}/content?token=${encodeURIComponent(capability.token)}`,
      expiresAt: capability.expiresAt,
    };
  }

  async readForManager(
    principal: AuthenticatedPrincipal,
    evidenceId: string,
    token: string,
  ) {
    const record = await this.managerAuthorized(principal, evidenceId);
    if (!this.tokens.verify(token, 'read', record.id, record.objectKey)) {
      throw new EvidenceTokenInvalidError();
    }
    return { record, content: await this.storage.readObject(record.objectKey) };
  }

  async remove(
    principal: AuthenticatedPrincipal,
    requestId: string,
    workOrderId: string,
    evidenceId: string,
    version: number,
  ) {
    const record = resolveMutation(
      await this.evidence.remove({
        organizationId: principal.organizationId,
        technicianId: principal.userId,
        workOrderId,
        evidenceId,
        expectedVersion: version,
        requestId,
      }),
    );
    await this.storage.deleteObject(record.objectKey);
    return this.workOrders.find(principal, workOrderId);
  }

  private async authorized(
    principal: AuthenticatedPrincipal,
    evidenceId: string,
    statuses?: Array<'PENDING' | 'AVAILABLE'>,
  ) {
    const record = await this.evidence.findAuthorized({
      organizationId: principal.organizationId,
      technicianId: principal.userId,
      evidenceId,
      statuses,
    });
    if (!record) throw new EvidenceNotFoundError();
    return record;
  }

  private async managerAuthorized(
    principal: AuthenticatedPrincipal,
    evidenceId: string,
  ) {
    const record = await this.evidence.findForManager({
      organizationId: principal.organizationId,
      evidenceId,
      statuses: ['AVAILABLE'],
    });
    if (!record) throw new EvidenceNotFoundError();
    return record;
  }
}

function resolveMutation(result: EvidenceMutationResult) {
  if (result.status === 'SUCCESS') return result.evidence;
  if (result.status === 'NOT_FOUND') throw new WorkOrderNotFoundError();
  if (result.status === 'STATUS_LOCKED') throw new WorkOrderStatusLockedError();
  if (result.status === 'VERSION_CONFLICT') {
    throw new WorkOrderVersionConflictError();
  }
  if (result.status === 'LIMIT_EXCEEDED') {
    throw new EvidenceLimitExceededError();
  }
  throw new EvidenceObjectMismatchError();
}
