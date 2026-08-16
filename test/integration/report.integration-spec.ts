import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import {
  REPORT_REPOSITORY,
  type ReportRepository,
} from '../../src/reports/application/ports/report.repository';
import { PrismaService } from '../../src/infrastructure/database/prisma/prisma.service';

describe('Service report persistence view', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let reports: ReportRepository;
  const organizationIds: string[] = [];
  let organizationA: string;
  let organizationB: string;
  let orderId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    reports = moduleRef.get(REPORT_REPOSITORY);
    const suffix = `${Date.now()}-${process.pid}`;
    const [orgA, orgB] = await Promise.all([
      prisma.organization.create({ data: { name: `Report A ${suffix}` } }),
      prisma.organization.create({ data: { name: `Report B ${suffix}` } }),
    ]);
    organizationA = orgA.id;
    organizationB = orgB.id;
    organizationIds.push(orgA.id, orgB.id);
    const technician = await createUser(
      prisma,
      orgA.id,
      `report-tech-${suffix}`,
    );
    const relation = await createRelation(prisma, orgA.id);
    const order = await prisma.workOrder.create({
      data: {
        organizationId: orgA.id,
        number: 1n,
        ...relation,
        serviceType: 'Preventiva',
        title: 'Relatório',
        normalizedTitle: 'relatorio',
        description: 'Conteúdo aprovado.',
        status: 'READY_TO_BILL',
        expectedAmountInCents: 1000n,
        finalAmountInCents: 1000n,
        financialSnapshot: { finalAmountInCents: '1000' },
        actualEndAt: new Date(),
        createdByUserId: technician.id,
      },
    });
    orderId = order.id;
    await prisma.workOrderExecution.create({
      data: {
        organizationId: orgA.id,
        workOrderId: order.id,
        technicianId: technician.id,
        notes: 'Execução persistida.',
      },
    });
  }, 20_000);

  afterAll(async () => {
    for (const organizationId of organizationIds) {
      await prisma.workOrderExecution.deleteMany({ where: { organizationId } });
      await prisma.workOrder.deleteMany({ where: { organizationId } });
      await prisma.serviceLocation.deleteMany({ where: { organizationId } });
      await prisma.customer.deleteMany({ where: { organizationId } });
      await prisma.user.deleteMany({ where: { organizationId } });
      await prisma.organization.delete({ where: { id: organizationId } });
    }
    await moduleRef?.close();
  }, 20_000);

  it('returns approved current data only inside the authenticated tenant', async () => {
    await expect(
      reports.findServiceReport({
        organizationId: organizationA,
        workOrderId: orderId,
      }),
    ).resolves.toMatchObject({ id: orderId, finalAmountInCents: 1000n });
    await expect(
      reports.findServiceReport({
        organizationId: organizationB,
        workOrderId: orderId,
      }),
    ).resolves.toBeNull();
  });
});

function createUser(
  prisma: PrismaService,
  organizationId: string,
  identity: string,
) {
  const email = `${identity}@example.test`;
  return prisma.user.create({
    data: {
      organizationId,
      name: identity,
      email,
      normalizedEmail: email,
      passwordHash: identity,
      role: 'TECHNICIAN',
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
      street: 'Rua Teste',
      number: '1',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
    },
  });
  return { customerId: customer.id, locationId: location.id };
}
