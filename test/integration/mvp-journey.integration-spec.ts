import { Test, type TestingModule } from '@nestjs/testing';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import { AdditionalItemsService } from '../../src/additional-items/application/additional-items.service';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/application/auth.service';
import type { AuthenticatedPrincipal } from '../../src/auth/domain/authenticated-principal';
import { AuthenticationRejectedError } from '../../src/auth/domain/authentication-rejected.error';
import { BillingService } from '../../src/billing/application/billing.service';
import { CustomersService } from '../../src/customers/application/customers.service';
import { EquipmentService } from '../../src/equipment/application/equipment.service';
import { EvidenceService } from '../../src/evidence/application/evidence.service';
import {
  EVIDENCE_STORAGE,
  type EvidenceStorage,
} from '../../src/evidence/application/ports/evidence-storage.port';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';
import { ServiceReportService } from '../../src/reports/application/service-report.service';
import { ReviewsService } from '../../src/reviews/application/reviews.service';
import { TechnicianWorkOrdersService } from '../../src/work-orders/application/technician-work-orders.service';
import { WorkOrdersService } from '../../src/work-orders/application/work-orders.service';
import { WorkOrderNotFoundError } from '../../src/work-orders/domain/work-order.errors';

describe('MVP commercial journey', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let auth: AuthService;
  let customers: CustomersService;
  let equipment: EquipmentService;
  let workOrders: WorkOrdersService;
  let field: TechnicianWorkOrdersService;
  let evidence: EvidenceService;
  let storage: EvidenceStorage;
  let additionalItems: AdditionalItemsService;
  let reviews: ReviewsService;
  let billing: BillingService;
  let reports: ServiceReportService;
  const organizationIds: string[] = [];
  const objectKeys: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    auth = moduleRef.get(AuthService);
    customers = moduleRef.get(CustomersService);
    equipment = moduleRef.get(EquipmentService);
    workOrders = moduleRef.get(WorkOrdersService);
    field = moduleRef.get(TechnicianWorkOrdersService);
    evidence = moduleRef.get(EvidenceService);
    storage = moduleRef.get(EVIDENCE_STORAGE);
    additionalItems = moduleRef.get(AdditionalItemsService);
    reviews = moduleRef.get(ReviewsService);
    billing = moduleRef.get(BillingService);
    reports = moduleRef.get(ServiceReportService);
    await assertTestDatabase(prisma);
  }, 20_000);

  afterAll(async () => {
    for (const objectKey of objectKeys) await storage.deleteObject(objectKey);
    for (const organizationId of organizationIds) {
      await prisma.session.deleteMany({ where: { organizationId } });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
      await prisma.review.deleteMany({ where: { organizationId } });
      await prisma.evidence.deleteMany({ where: { organizationId } });
      await prisma.additionalItem.deleteMany({ where: { organizationId } });
      await prisma.workOrderExecution.deleteMany({ where: { organizationId } });
      await prisma.workOrderAssignment.deleteMany({
        where: { organizationId },
      });
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
  }, 30_000);

  it('runs the sellable flow and denies the same IDs to another tenant', async () => {
    const suffix = `${Date.now()}-${process.pid}`;
    const password = 'JourneyLocalOnly!2026';
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({ data: { name: `Journey A ${suffix}` } }),
      prisma.organization.create({ data: { name: `Journey B ${suffix}` } }),
    ]);
    organizationIds.push(organizationA.id, organizationB.id);
    const passwordHash = await hash(password);
    const [ownerAUser, technicianAUser, ownerBUser, technicianBUser] =
      await Promise.all([
        createUser(
          prisma,
          organizationA.id,
          `owner-a-${suffix}`,
          'OWNER',
          passwordHash,
        ),
        createUser(prisma, organizationA.id, `tech-a-${suffix}`, 'TECHNICIAN'),
        createUser(prisma, organizationB.id, `owner-b-${suffix}`, 'OWNER'),
        createUser(prisma, organizationB.id, `tech-b-${suffix}`, 'TECHNICIAN'),
      ]);
    const ownerA = principal(ownerAUser.id, organizationA.id, 'OWNER');
    const technicianA = principal(
      technicianAUser.id,
      organizationA.id,
      'TECHNICIAN',
    );
    const ownerB = principal(ownerBUser.id, organizationB.id, 'OWNER');
    const technicianB = principal(
      technicianBUser.id,
      organizationB.id,
      'TECHNICIAN',
    );

    const authentication = await auth.login(ownerAUser.email, password);
    expect(authentication.account.user.id).toBe(ownerA.userId);

    const customer = await customers.createCustomer(
      context(ownerA, 'customer'),
      {
        name: `Cliente Jornada ${suffix}`,
        document: `DOC-${suffix}`,
      },
    );
    const location = await customers.createLocation(
      context(ownerA, 'location'),
      customer.id,
      {
        name: 'Matriz',
        postalCode: '01000-000',
        street: 'Rua da Jornada',
        number: '10',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
      },
    );
    const machine = await equipment.create(context(ownerA, 'equipment'), {
      customerId: customer.id,
      locationId: location.id,
      name: 'Condensadora principal',
      identifier: `EQ-${suffix}`,
      category: 'Climatização',
      serialNumber: `SER-${suffix}`,
    });
    const draft = await workOrders.create(context(ownerA, 'work-order'), {
      customerId: customer.id,
      locationId: location.id,
      equipmentId: machine.id,
      serviceType: 'Manutenção preventiva',
      title: 'Jornada completa do MVP',
      description: 'Atendimento determinístico do fluxo comercial.',
      expectedAmountInCents: '10000',
    });
    const scheduled = await workOrders.schedule(
      context(ownerA, 'schedule'),
      draft.id,
      {
        version: draft.version,
        technicianId: technicianA.userId,
        scheduledStartAt: new Date(Date.now() + 60_000),
        scheduledEndAt: new Date(Date.now() + 3_660_000),
      },
    );
    expect(scheduled.status).toBe('SCHEDULED');
    await expect(
      workOrders.find(context(ownerB, 'cross-manager'), draft.id),
    ).rejects.toBeInstanceOf(WorkOrderNotFoundError);
    await expect(field.find(technicianB, draft.id)).rejects.toBeInstanceOf(
      WorkOrderNotFoundError,
    );

    let current = await field.start(
      technicianA,
      'start',
      draft.id,
      scheduled.version,
    );
    current = await addEvidence(
      evidence,
      prisma,
      technicianA,
      draft.id,
      current,
      'foto.png',
      objectKeys,
    );
    current = await additionalItems.create(
      technicianA,
      'additional-item',
      draft.id,
      {
        version: requiredExecutionVersion(current),
        type: 'MATERIAL',
        description: 'Material complementar',
        quantity: '2',
        unitAmountInCents: '2500',
      },
    );
    current = await field.updateExecution(
      technicianA,
      'notes',
      draft.id,
      requiredExecutionVersion(current),
      'Execução concluída e comprovada.',
    );
    current = await field.submitForReview(
      technicianA,
      'first-submit',
      draft.id,
      requiredExecutionVersion(current),
    );
    expect(current.status).toBe('AWAITING_REVIEW');

    const firstReview = await workOrders.find(
      context(ownerA, 'first-review'),
      draft.id,
    );
    await reviews.requestCorrection(ownerA, 'correction', draft.id, {
      version: firstReview.version,
      reason: 'OTHER',
      description: 'Confirmar observação final.',
    });
    current = await field.find(technicianA, draft.id);
    current = await field.resumeCorrection(
      technicianA,
      'resume',
      draft.id,
      current.version,
    );
    current = await field.updateExecution(
      technicianA,
      'correct-notes',
      draft.id,
      requiredExecutionVersion(current),
      'Observação final confirmada.',
    );
    current = await field.submitForReview(
      technicianA,
      'second-submit',
      draft.id,
      requiredExecutionVersion(current),
    );

    const beforeApproval = await workOrders.find(
      context(ownerA, 'approve-find'),
      draft.id,
    );
    await expect(reviews.find(ownerB, draft.id)).rejects.toBeInstanceOf(
      WorkOrderNotFoundError,
    );
    const approval = await reviews.approve(
      ownerA,
      'approve',
      draft.id,
      beforeApproval.version,
    );
    expect(approval).toEqual({
      status: 'READY_TO_BILL',
      finalAmountInCents: 15_000n,
    });
    const ready = await billing.listReady(ownerA, { page: 1, pageSize: 20 });
    expect(ready.items.map((item) => item.id)).toContain(draft.id);
    expect(await billing.exportReady(ownerA, {})).toContain('"15000"');
    const report = await reports.generate(ownerA, draft.id);
    expect(report.content.subarray(0, 4).toString()).toBe('%PDF');
    await expect(reports.generate(ownerB, draft.id)).rejects.toBeInstanceOf(
      WorkOrderNotFoundError,
    );
    const billable = await workOrders.find(
      context(ownerA, 'billing-find'),
      draft.id,
    );
    await billing.markBilled(ownerA, 'bill', draft.id, billable.version);
    await expect(
      prisma.workOrder.findUniqueOrThrow({ where: { id: draft.id } }),
    ).resolves.toMatchObject({ status: 'BILLED', finalAmountInCents: 15_000n });

    await auth.logout(authentication.refreshToken);
    await expect(
      auth.refresh(authentication.refreshToken),
    ).rejects.toBeInstanceOf(AuthenticationRejectedError);
  }, 60_000);
});

async function addEvidence(
  evidence: EvidenceService,
  prisma: PrismaService,
  principal: AuthenticatedPrincipal,
  workOrderId: string,
  current: Awaited<ReturnType<TechnicianWorkOrdersService['find']>>,
  fileName: string,
  objectKeys: string[],
) {
  const content = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const created = await evidence.createIntent(
    principal,
    `intent-${randomUUID()}`,
    workOrderId,
    {
      version: requiredExecutionVersion(current),
      fileName,
      contentType: 'image/png',
      sizeBytes: content.byteLength,
    },
  );
  const url = new URL(created.intent.uploadUrl, 'http://localhost/');
  const token = url.searchParams.get('token');
  if (!token) throw new Error('Evidence upload token was not issued.');
  await evidence.upload(
    principal,
    created.intent.evidenceId,
    token,
    'image/png',
    content,
  );
  const confirmed = await evidence.confirm(
    principal,
    `confirm-${randomUUID()}`,
    workOrderId,
    created.intent.evidenceId,
    requiredExecutionVersion(created.workOrder),
  );
  const record = await prisma.evidence.findUniqueOrThrow({
    where: { id: created.intent.evidenceId },
    select: { objectKey: true },
  });
  objectKeys.push(record.objectKey);
  return confirmed;
}

function requiredExecutionVersion(
  workOrder: Awaited<ReturnType<TechnicianWorkOrdersService['find']>>,
) {
  if (!workOrder.execution) throw new Error('Expected work order execution.');
  return workOrder.execution.version;
}

function context(principalValue: AuthenticatedPrincipal, requestId: string) {
  return { principal: principalValue, requestId };
}

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
  passwordHash = `integration-${identity}`,
) {
  const email = `${identity}@example.test`;
  return prisma.user.create({
    data: {
      organizationId,
      name: identity,
      email,
      normalizedEmail: email,
      passwordHash,
      role,
    },
  });
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
    throw new Error('MVP journey connected to an unexpected database.');
  }
}
