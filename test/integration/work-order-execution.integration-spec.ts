import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import type { AuthenticatedPrincipal } from '../../src/auth/domain/authenticated-principal';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';
import { TechnicianWorkOrdersService } from '../../src/work-orders/application/technician-work-orders.service';
import { WorkOrdersService } from '../../src/work-orders/application/work-orders.service';
import { ReviewsService } from '../../src/reviews/application/reviews.service';
import { EvidenceService } from '../../src/evidence/application/evidence.service';
import { EvidenceNotFoundError } from '../../src/evidence/domain/evidence.errors';
import {
  WorkOrderExecutionAlreadyStartedError,
  WorkOrderNotFoundError,
  WorkOrderVersionConflictError,
  WorkOrderManagementForbiddenError,
  WorkOrderStatusLockedError,
} from '../../src/work-orders/domain/work-order.errors';

describe('Work order execution draft', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let managerService: WorkOrdersService;
  let fieldService: TechnicianWorkOrdersService;
  let reviewsService: ReviewsService;
  let evidenceService: EvidenceService;
  let organizationId: string;
  let owner: AuthenticatedPrincipal;
  let technician: AuthenticatedPrincipal;
  let otherTechnician: AuthenticatedPrincipal;
  let relation: { customerId: string; locationId: string; equipmentId: string };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    managerService = moduleRef.get(WorkOrdersService);
    fieldService = moduleRef.get(TechnicianWorkOrdersService);
    reviewsService = moduleRef.get(ReviewsService);
    evidenceService = moduleRef.get(EvidenceService);
    await assertTestDatabase(prisma);
    const suffix = `${Date.now()}-${process.pid}`;
    const organization = await prisma.organization.create({
      data: { name: `Execution ${suffix}` },
    });
    organizationId = organization.id;
    const [ownerUser, technicianUser, otherUser] = await Promise.all([
      createUser(prisma, organizationId, `execution-owner-${suffix}`, 'OWNER'),
      createUser(
        prisma,
        organizationId,
        `execution-tech-${suffix}`,
        'TECHNICIAN',
      ),
      createUser(
        prisma,
        organizationId,
        `execution-other-${suffix}`,
        'TECHNICIAN',
      ),
    ]);
    owner = principal(ownerUser.id, organizationId, 'OWNER');
    technician = principal(technicianUser.id, organizationId, 'TECHNICIAN');
    otherTechnician = principal(otherUser.id, organizationId, 'TECHNICIAN');
    relation = await createRelation(prisma, organizationId);
  }, 20_000);

  afterAll(async () => {
    if (organizationId) {
      await prisma.evidence.deleteMany({ where: { organizationId } });
      await prisma.additionalItem.deleteMany({ where: { organizationId } });
      await prisma.review.deleteMany({ where: { organizationId } });
      await prisma.workOrderExecution.deleteMany({ where: { organizationId } });
      await prisma.workOrderAssignment.deleteMany({
        where: { organizationId },
      });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
      await prisma.workOrderStatusHistory.deleteMany({
        where: { organizationId },
      });
      await prisma.workOrder.deleteMany({ where: { organizationId } });
      await prisma.workOrderCounter.deleteMany({ where: { organizationId } });
      await prisma.equipment.deleteMany({ where: { organizationId } });
      await prisma.serviceLocation.deleteMany({ where: { organizationId } });
      await prisma.customer.deleteMany({ where: { organizationId } });
      await prisma.user.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    }
    await moduleRef?.close();
  }, 20_000);

  it('starts only the assigned order with server timestamps and atomic history', async () => {
    const scheduled = await createScheduled('start');
    await expect(
      fieldService.start(
        otherTechnician,
        'other-start',
        scheduled.id,
        scheduled.version,
      ),
    ).rejects.toBeInstanceOf(WorkOrderNotFoundError);

    const before = new Date();
    const started = await fieldService.start(
      technician,
      'assigned-start',
      scheduled.id,
      scheduled.version,
    );
    expect(started).toMatchObject({
      status: 'IN_PROGRESS',
      version: scheduled.version + 1,
      execution: { technicianId: technician.userId, version: 1, notes: null },
    });
    expect(started.actualStartAt?.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
    await expect(
      prisma.workOrderStatusHistory.findFirst({
        where: { organizationId, workOrderId: scheduled.id },
        orderBy: { createdAt: 'desc' },
      }),
    ).resolves.toMatchObject({
      previousStatus: 'SCHEDULED',
      newStatus: 'IN_PROGRESS',
      actorUserId: technician.userId,
      reason: 'WORK_ORDER_STARTED',
    });
  });

  it('persists normalized progress and rejects stale execution versions', async () => {
    const scheduled = await createScheduled('progress');
    const started = await fieldService.start(
      technician,
      'progress-start',
      scheduled.id,
      scheduled.version,
    );
    const updated = await fieldService.updateExecution(
      technician,
      'progress-save',
      scheduled.id,
      started.execution?.version ?? 0,
      '  Observação persistida no servidor  ',
    );
    expect(updated.execution).toMatchObject({
      notes: 'Observação persistida no servidor',
      version: 2,
    });
    await expect(
      fieldService.updateExecution(
        technician,
        'progress-stale',
        scheduled.id,
        1,
        'Sobrescrita indevida',
      ),
    ).rejects.toBeInstanceOf(WorkOrderVersionConflictError);
    await expect(
      fieldService.find(technician, scheduled.id),
    ).resolves.toMatchObject({
      execution: { notes: 'Observação persistida no servidor', version: 2 },
    });
  });

  it('never duplicates execution under repeated or concurrent start', async () => {
    const scheduled = await createScheduled('concurrent');
    const attempts = await Promise.allSettled([
      fieldService.start(
        technician,
        'concurrent-a',
        scheduled.id,
        scheduled.version,
      ),
      fieldService.start(
        technician,
        'concurrent-b',
        scheduled.id,
        scheduled.version,
      ),
    ]);
    expect(
      attempts.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      attempts.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      prisma.workOrderExecution.count({
        where: { organizationId, workOrderId: scheduled.id },
      }),
    ).resolves.toBe(1);
    const current = await fieldService.find(technician, scheduled.id);
    await expect(
      fieldService.start(
        technician,
        'repeat-start',
        scheduled.id,
        current.version,
      ),
    ).rejects.toBeInstanceOf(WorkOrderExecutionAlreadyStartedError);
  });

  it('submits the execution once and locks further edits', async () => {
    const scheduled = await createScheduled('completion');
    const started = await fieldService.start(
      technician,
      'completion-start',
      scheduled.id,
      scheduled.version,
    );
    const executionId = started.execution?.id;
    if (!executionId) throw new Error('Expected execution.');
    await prisma.evidence.createMany({
      data: [
        {
          organizationId,
          workOrderId: scheduled.id,
          executionId,
          createdByUserId: technician.userId,
          kind: 'PHOTO',
          status: 'AVAILABLE',
          objectKey: `${organizationId}/${scheduled.id}/${randomUUID()}`,
          fileName: 'photo.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 10,
          confirmedAt: new Date(),
        },
        {
          organizationId,
          workOrderId: scheduled.id,
          executionId,
          createdByUserId: technician.userId,
          kind: 'SIGNATURE',
          status: 'AVAILABLE',
          objectKey: `${organizationId}/${scheduled.id}/${randomUUID()}`,
          fileName: 'signature.png',
          contentType: 'image/png',
          sizeBytes: 10,
          confirmedAt: new Date(),
        },
      ],
    });
    await prisma.workOrder.update({
      where: { id: scheduled.id },
      data: { expectedAmountInCents: 10_000n },
    });
    await prisma.additionalItem.create({
      data: {
        organizationId,
        workOrderId: scheduled.id,
        executionId,
        createdByUserId: technician.userId,
        updatedByUserId: technician.userId,
        type: 'SERVICE',
        description: 'Ajuste adicional aprovado',
        quantityInThousand: 1_000n,
        unitAmountInCents: 2_500n,
        totalAmountInCents: 2_500n,
      },
    });

    const submitted = await fieldService.submitForReview(
      technician,
      'completion-submit',
      scheduled.id,
      started.execution?.version ?? 0,
    );
    expect(submitted.status).toBe('AWAITING_REVIEW');
    expect(submitted.actualEndAt).toBeInstanceOf(Date);
    await fieldService.submitForReview(
      technician,
      'completion-repeat',
      scheduled.id,
      started.execution?.version ?? 0,
    );
    await expect(
      prisma.workOrderStatusHistory.count({
        where: {
          organizationId,
          workOrderId: scheduled.id,
          newStatus: 'AWAITING_REVIEW',
        },
      }),
    ).resolves.toBe(1);

    const queue = await reviewsService.list(owner, {
      page: 1,
      pageSize: 20,
      orderBy: 'AGING_DESC',
    });
    expect(queue.items.map((item) => item.id)).toContain(scheduled.id);
    const review = await reviewsService.find(owner, scheduled.id);
    expect(review.execution.evidence.map((item) => item.kind).sort()).toEqual([
      'PHOTO',
      'SIGNATURE',
    ]);
    const photo = review.execution.evidence.find(
      (item) => item.kind === 'PHOTO',
    );
    if (!photo) throw new Error('Expected photo evidence.');
    const readUrl = await evidenceService.readUrlForManager(owner, photo.id);
    expect(readUrl.url).toContain(`reviews/evidence/${photo.id}/content`);

    const foreignOrganization = await prisma.organization.create({
      data: { name: `Foreign review ${randomUUID()}` },
    });
    const foreignUser = await createUser(
      prisma,
      foreignOrganization.id,
      `foreign-review-${randomUUID()}`,
      'OWNER',
    );
    const foreignPrincipal = principal(
      foreignUser.id,
      foreignOrganization.id,
      'OWNER',
    );
    try {
      await expect(
        reviewsService.find(foreignPrincipal, scheduled.id),
      ).rejects.toBeInstanceOf(WorkOrderNotFoundError);
      await expect(
        evidenceService.readUrlForManager(foreignPrincipal, photo.id),
      ).rejects.toBeInstanceOf(EvidenceNotFoundError);
    } finally {
      await prisma.user.delete({ where: { id: foreignUser.id } });
      await prisma.organization.delete({
        where: { id: foreignOrganization.id },
      });
    }
    await expect(
      fieldService.updateExecution(
        technician,
        'completion-locked',
        scheduled.id,
        (submitted.execution?.version ?? 0) + 1,
        'Should not persist',
      ),
    ).rejects.toBeInstanceOf(WorkOrderStatusLockedError);

    await reviewsService.requestCorrection(
      owner,
      'correction-request',
      scheduled.id,
      {
        version: submitted.version,
        reason: 'EQUIPMENT_DATA_INCORRECT',
        description: 'Confirme o número de série registrado no atendimento.',
      },
    );
    await reviewsService.requestCorrection(
      owner,
      'correction-repeat',
      scheduled.id,
      {
        version: submitted.version,
        reason: 'EQUIPMENT_DATA_INCORRECT',
        description: 'Confirme o número de série registrado no atendimento.',
      },
    );
    await expect(
      prisma.review.count({
        where: { organizationId, workOrderId: scheduled.id },
      }),
    ).resolves.toBe(1);

    const pendingCorrection = await fieldService.find(technician, scheduled.id);
    expect(pendingCorrection).toMatchObject({
      status: 'PENDING_CORRECTION',
      currentCorrection: {
        reason: 'EQUIPMENT_DATA_INCORRECT',
        description: 'Confirme o número de série registrado no atendimento.',
      },
    });
    const resumed = await fieldService.resumeCorrection(
      technician,
      'correction-resume',
      scheduled.id,
      pendingCorrection.version,
    );
    expect(resumed.status).toBe('IN_PROGRESS');
    await fieldService.resumeCorrection(
      technician,
      'correction-resume-repeat',
      scheduled.id,
      pendingCorrection.version,
    );
    const corrected = await fieldService.updateExecution(
      technician,
      'correction-save',
      scheduled.id,
      resumed.execution?.version ?? 0,
      'Número de série conferido.',
    );
    const resubmitted = await fieldService.submitForReview(
      technician,
      'correction-resubmit',
      scheduled.id,
      corrected.execution?.version ?? 0,
    );
    expect(resubmitted.status).toBe('AWAITING_REVIEW');
    await expect(
      prisma.workOrderStatusHistory.count({
        where: {
          organizationId,
          workOrderId: scheduled.id,
          newStatus: 'AWAITING_REVIEW',
        },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.evidence.count({
        where: { organizationId, workOrderId: scheduled.id },
      }),
    ).resolves.toBe(2);
    const rereview = await reviewsService.find(owner, scheduled.id);
    expect(rereview.reviews).toHaveLength(1);

    await expect(
      reviewsService.approve(
        technician,
        'technician-approval',
        scheduled.id,
        resubmitted.version,
      ),
    ).rejects.toBeInstanceOf(WorkOrderManagementForbiddenError);
    const approvals = await Promise.allSettled([
      reviewsService.approve(
        owner,
        'approval-one',
        scheduled.id,
        resubmitted.version,
      ),
      reviewsService.approve(
        owner,
        'approval-two',
        scheduled.id,
        resubmitted.version,
      ),
    ]);
    expect(
      approvals.filter((item) => item.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(approvals.filter((item) => item.status === 'rejected')).toHaveLength(
      1,
    );
    const approved = await prisma.workOrder.findUniqueOrThrow({
      where: { id: scheduled.id },
    });
    expect(approved).toMatchObject({
      status: 'READY_TO_BILL',
      finalAmountInCents: 12_500n,
    });
    expect(approved.financialSnapshot).toMatchObject({
      expectedAmountInCents: '10000',
      additionalTotalInCents: '2500',
      finalAmountInCents: '12500',
    });
    await expect(
      prisma.review.count({
        where: {
          organizationId,
          workOrderId: scheduled.id,
          decision: 'APPROVED',
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.workOrderStatusHistory.count({
        where: {
          organizationId,
          workOrderId: scheduled.id,
          newStatus: 'READY_TO_BILL',
        },
      }),
    ).resolves.toBe(1);
  });

  async function createScheduled(label: string) {
    const draft = await managerService.create(
      { principal: owner, requestId: `execution-create-${label}` },
      {
        ...relation,
        serviceType: 'Manutenção',
        title: `Execução ${label}`,
        description: 'Executar atendimento em campo.',
      },
    );
    return managerService.schedule(
      { principal: owner, requestId: `execution-schedule-${label}` },
      draft.id,
      {
        version: draft.version,
        technicianId: technician.userId,
        scheduledStartAt: new Date(Date.now() + 3_600_000),
        scheduledEndAt: new Date(Date.now() + 7_200_000),
      },
    );
  }
});

function principal(
  userId: string,
  organizationId: string,
  role: 'OWNER' | 'TECHNICIAN',
): AuthenticatedPrincipal {
  return { userId, organizationId, role, sessionId: randomUUID() };
}

function createUser(
  prisma: PrismaService,
  organizationId: string,
  identity: string,
  role: 'OWNER' | 'TECHNICIAN',
) {
  const email = `${identity}@example.test`;
  return prisma.user.create({
    data: {
      organizationId,
      name: identity,
      email,
      normalizedEmail: email,
      passwordHash: `integration-${identity}`,
      role,
    },
  });
}

async function createRelation(prisma: PrismaService, organizationId: string) {
  const customer = await prisma.customer.create({
    data: {
      organizationId,
      name: 'Cliente execução',
      normalizedName: 'cliente execução',
    },
  });
  const location = await prisma.serviceLocation.create({
    data: {
      organizationId,
      customerId: customer.id,
      name: 'Local execução',
      normalizedName: 'local execução',
      postalCode: '01000-000',
      street: 'Rua Campo',
      number: '10',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
    },
  });
  const equipment = await prisma.equipment.create({
    data: {
      organizationId,
      customerId: customer.id,
      locationId: location.id,
      name: 'Equipamento execução',
      normalizedName: 'equipamento execução',
      identifier: 'EQ-EXEC',
      normalizedIdentifier: 'eq-exec',
      category: 'Teste',
    },
  });
  return {
    customerId: customer.id,
    locationId: location.id,
    equipmentId: equipment.id,
  };
}

async function assertTestDatabase(prisma: PrismaService): Promise<void> {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required.');
  const expected = decodeURIComponent(
    new URL(testDatabaseUrl).pathname.slice(1),
  );
  const [connection] = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  if (connection?.database !== expected) {
    throw new Error('Execution test connected to an unexpected database.');
  }
}
