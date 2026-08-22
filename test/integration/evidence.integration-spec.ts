import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import type { AuthenticatedPrincipal } from '../../src/auth/domain/authenticated-principal';
import { EvidenceService } from '../../src/evidence/application/evidence.service';
import {
  EVIDENCE_STORAGE,
  type EvidenceStorage,
  type StoredEvidenceMetadata,
} from '../../src/evidence/application/ports/evidence-storage.port';
import { EvidenceNotFoundError } from '../../src/evidence/domain/evidence.errors';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';
import { TechnicianWorkOrdersService } from '../../src/work-orders/application/technician-work-orders.service';
import { WorkOrdersService } from '../../src/work-orders/application/work-orders.service';

describe('Private evidence', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let evidence: EvidenceService;
  let office: WorkOrdersService;
  let field: TechnicianWorkOrdersService;
  let storage: MemoryEvidenceStorage;
  let organizationId: string;
  let otherOrganizationId: string;
  let owner: AuthenticatedPrincipal;
  let technician: AuthenticatedPrincipal;
  let outsider: AuthenticatedPrincipal;
  let relation: { customerId: string; locationId: string };

  beforeAll(async () => {
    storage = new MemoryEvidenceStorage();
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EVIDENCE_STORAGE)
      .useValue(storage)
      .compile();
    prisma = moduleRef.get(PrismaService);
    evidence = moduleRef.get(EvidenceService);
    office = moduleRef.get(WorkOrdersService);
    field = moduleRef.get(TechnicianWorkOrdersService);
    await assertTestDatabase(prisma);
    const suffix = `${Date.now()}-${process.pid}`;
    const organization = await prisma.organization.create({
      data: { name: `Evidence ${suffix}` },
    });
    const otherOrganization = await prisma.organization.create({
      data: { name: `Evidence outsider ${suffix}` },
    });
    organizationId = organization.id;
    otherOrganizationId = otherOrganization.id;
    const ownerUser = await createUser(
      prisma,
      organizationId,
      `owner-${suffix}`,
      'OWNER',
    );
    const technicianUser = await createUser(
      prisma,
      organizationId,
      `tech-${suffix}`,
      'TECHNICIAN',
    );
    const outsiderUser = await createUser(
      prisma,
      otherOrganizationId,
      `outsider-${suffix}`,
      'TECHNICIAN',
    );
    owner = principal(ownerUser.id, organizationId, 'OWNER');
    technician = principal(technicianUser.id, organizationId, 'TECHNICIAN');
    outsider = principal(outsiderUser.id, otherOrganizationId, 'TECHNICIAN');
    relation = await createRelation(prisma, organizationId);
  }, 20_000);

  afterAll(async () => {
    for (const id of [organizationId, otherOrganizationId]) {
      if (!id) continue;
      await prisma.evidence.deleteMany({ where: { organizationId: id } });
      await prisma.workOrderExecution.deleteMany({
        where: { organizationId: id },
      });
      await prisma.workOrderAssignment.deleteMany({
        where: { organizationId: id },
      });
      await prisma.auditLog.deleteMany({ where: { organizationId: id } });
      await prisma.workOrderStatusHistory.deleteMany({
        where: { organizationId: id },
      });
      await prisma.workOrder.deleteMany({ where: { organizationId: id } });
      await prisma.workOrderCounter.deleteMany({
        where: { organizationId: id },
      });
      await prisma.serviceLocation.deleteMany({
        where: { organizationId: id },
      });
      await prisma.customer.deleteMany({ where: { organizationId: id } });
      await prisma.user.deleteMany({ where: { organizationId: id } });
      await prisma.organization.delete({ where: { id } });
    }
    await moduleRef?.close();
  }, 20_000);

  it('keeps pending uploads private and confirms idempotently after storage verification', async () => {
    const draft = await office.create(
      { principal: owner, requestId: 'evidence-create' },
      {
        ...relation,
        serviceType: 'Manutenção',
        title: 'Evidência privada',
        description: 'Teste de evidência.',
      },
    );
    const scheduled = await office.schedule(
      { principal: owner, requestId: 'evidence-schedule' },
      draft.id,
      {
        version: draft.version,
        technicianId: technician.userId,
        scheduledStartAt: new Date(Date.now() + 60_000),
        scheduledEndAt: new Date(Date.now() + 120_000),
      },
    );
    const started = await field.start(
      technician,
      'evidence-start',
      scheduled.id,
      scheduled.version,
    );
    const content = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const created = await evidence.createIntent(
      technician,
      'evidence-intent',
      scheduled.id,
      {
        version: started.execution?.version ?? 0,
        fileName: 'inspection.jpg',
        contentType: 'image/jpeg',
        sizeBytes: content.byteLength,
      },
    );
    expect(created.workOrder.execution?.evidence).toEqual([]);
    const token = new URL(
      created.intent.uploadUrl,
      'http://local',
    ).searchParams.get('token');
    expect(token).toBeTruthy();
    await evidence.upload(
      technician,
      created.intent.evidenceId,
      token ?? '',
      'image/jpeg',
      content,
    );
    const confirmed = await evidence.confirm(
      technician,
      'evidence-confirm',
      scheduled.id,
      created.intent.evidenceId,
      created.workOrder.execution?.version ?? 0,
    );
    expect(confirmed.execution?.evidence).toHaveLength(1);
    await expect(
      evidence.confirm(
        technician,
        'evidence-confirm-repeat',
        scheduled.id,
        created.intent.evidenceId,
        created.workOrder.execution?.version ?? 0,
      ),
    ).resolves.toMatchObject({ id: scheduled.id });

    await expect(
      evidence.readUrl(outsider, created.intent.evidenceId),
    ).rejects.toBeInstanceOf(EvidenceNotFoundError);
    const readUrl = await evidence.readUrl(
      technician,
      created.intent.evidenceId,
    );
    const readToken = new URL(readUrl.url, 'http://local').searchParams.get(
      'token',
    );
    const downloaded = await evidence.read(
      technician,
      created.intent.evidenceId,
      readToken ?? '',
    );
    expect(downloaded.content).toEqual(content);

    const removed = await evidence.remove(
      technician,
      'evidence-remove',
      scheduled.id,
      created.intent.evidenceId,
      confirmed.execution?.version ?? 0,
    );
    expect(removed.execution?.evidence).toEqual([]);
    expect(storage.objects.size).toBe(0);
  });
});

class MemoryEvidenceStorage implements EvidenceStorage {
  readonly objects = new Map<
    string,
    { content: Buffer; metadata: StoredEvidenceMetadata }
  >();
  putObject(key: string, content: Buffer, metadata: StoredEvidenceMetadata) {
    this.objects.set(key, { content, metadata });
    return Promise.resolve();
  }
  statObject(key: string) {
    return Promise.resolve(this.objects.get(key)?.metadata ?? null);
  }
  readObject(key: string) {
    const object = this.objects.get(key);
    if (!object) throw new Error('Missing controlled object.');
    return Promise.resolve(object.content);
  }
  deleteObject(key: string) {
    this.objects.delete(key);
    return Promise.resolve();
  }
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
    data: { organizationId, name: 'Cliente', normalizedName: 'cliente' },
  });
  const location = await prisma.serviceLocation.create({
    data: {
      organizationId,
      customerId: customer.id,
      name: 'Local',
      normalizedName: 'local',
      postalCode: '01000-000',
      street: 'Rua Campo',
      number: '10',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
    },
  });
  return { customerId: customer.id, locationId: location.id };
}

async function assertTestDatabase(prisma: PrismaService): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required.');
  const expected = decodeURIComponent(new URL(url).pathname.slice(1));
  const [connection] = await prisma.$queryRaw<Array<{ database: string }>>`
    SELECT current_database() AS database
  `;
  if (connection?.database !== expected) {
    throw new Error('Evidence test connected to an unexpected database.');
  }
}
