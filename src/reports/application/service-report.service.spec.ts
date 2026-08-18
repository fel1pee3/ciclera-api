import { PDFDocument } from 'pdf-lib';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import type { EvidenceStorage } from '../../evidence/application/ports/evidence-storage.port';
import { WorkOrderManagementForbiddenError } from '../../work-orders/domain/work-order.errors';
import type {
  ReportRepository,
  ServiceReportData,
} from './ports/report.repository';
import { ServiceReportService } from './service-report.service';

describe('ServiceReportService', () => {
  const report = fixture();
  const repository: jest.Mocked<ReportRepository> = {
    findServiceReport: jest.fn().mockResolvedValue(report),
  };
  const storage: jest.Mocked<EvidenceStorage> = {
    putObject: jest.fn(),
    statObject: jest.fn(),
    readObject: jest
      .fn()
      .mockResolvedValue(
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        ),
      ),
    deleteObject: jest.fn(),
  };
  const service = new ServiceReportService(repository, storage);

  beforeEach(() => jest.clearAllMocks());

  it('generates a valid paginated PDF with proportional selected evidence', async () => {
    const result = await service.generate(principal('OWNER'), report.id);
    expect(result.fileName).toBe('relatorio-OS-000001.pdf');
    expect(result.content.subarray(0, 4).toString()).toBe('%PDF');
    const document = await PDFDocument.load(result.content);
    expect(document.getPageCount()).toBeGreaterThan(1);
    expect(storage.readObject.mock.calls).toContainEqual([
      'tenant/report/photo',
    ]);
    expect(repository.findServiceReport.mock.calls).toContainEqual([
      { organizationId: 'organization-id', workOrderId: report.id },
    ]);
  });

  it('rejects technician generation before reading report data', async () => {
    await expect(
      service.generate(principal('TECHNICIAN'), report.id),
    ).rejects.toBeInstanceOf(WorkOrderManagementForbiddenError);
    expect(repository.findServiceReport.mock.calls).toHaveLength(0);
  });
});

function principal(role: 'OWNER' | 'TECHNICIAN'): AuthenticatedPrincipal {
  return {
    userId: 'user-id',
    organizationId: 'organization-id',
    sessionId: 'session-id',
    role,
  };
}

function fixture(): ServiceReportData {
  return {
    id: '1ff04fd9-c0b8-485a-8a36-a27ce3ca1419',
    number: 1n,
    status: 'READY_TO_BILL',
    title: 'Manutenção aprovada',
    serviceType: 'Preventiva',
    description: 'Relatório consistente com a ordem aprovada.',
    scheduledStartAt: new Date(),
    scheduledEndAt: new Date(),
    actualStartAt: new Date(),
    actualEndAt: new Date(),
    expectedAmountInCents: 10_000n,
    finalAmountInCents: 12_500n,
    organization: { name: 'Organização teste', timezone: 'America/Sao_Paulo' },
    customer: { name: 'Cliente teste', document: '00000000000' },
    location: {
      name: 'Matriz',
      street: 'Rua Teste',
      number: '1',
      complement: null,
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
    },
    equipment: {
      name: 'Equipamento',
      identifier: 'EQ-1',
      category: 'Climatização',
      brand: 'Marca',
      model: 'Modelo',
      serialNumber: 'SERIE-1',
    },
    execution: {
      technicianName: 'Técnico',
      notes: 'Execução concluída com observações técnicas detalhadas. '.repeat(
        200,
      ),
      startedAt: new Date(),
    },
    additionalItems: [
      {
        type: 'MATERIAL',
        description: 'Peça',
        quantityInThousand: 1000n,
        unitAmountInCents: 2_500n,
        totalAmountInCents: 2_500n,
      },
    ],
    evidence: [
      {
        id: 'evidence-id',
        kind: 'PHOTO',
        objectKey: 'tenant/report/photo',
        contentType: 'image/png',
      },
    ],
  };
}
