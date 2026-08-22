import type { TechnicianWorkOrder } from '../application/ports/technician-work-order.repository';
import { toTechnicianWorkOrderResponse } from './technician-work-order.presenter';

describe('technician work order presenter', () => {
  it('converts every bigint returned after field mutations into JSON-safe strings', () => {
    const now = new Date('2026-08-18T12:00:00.000Z');
    const workOrder: TechnicianWorkOrder = {
      id: 'work-order-id',
      number: 1n,
      customer: { id: 'customer-id', name: 'Cliente' },
      location: {
        id: 'location-id',
        name: 'Unidade',
        street: 'Rua Teste',
        number: '100',
        complement: null,
        neighborhood: 'Centro',
        city: 'Fortaleza',
        state: 'CE',
      },
      equipment: null,
      serviceType: 'Manutenção',
      title: 'Atendimento técnico',
      description: 'Descrição',
      priority: 'NORMAL',
      status: 'IN_PROGRESS',
      scheduledStartAt: now,
      scheduledEndAt: now,
      actualStartAt: now,
      actualEndAt: null,
      version: 2,
      currentCorrection: null,
      execution: {
        id: 'execution-id',
        technicianId: 'technician-id',
        notes: null,
        version: 4,
        startedAt: now,
        updatedAt: now,
        evidence: [
          {
            id: 'evidence-id',
            fileName: 'foto.jpg',
            contentType: 'image/jpeg',
            sizeBytes: 1_024n,
            confirmedAt: now,
            createdAt: now,
          },
        ],
        additionalItems: [
          {
            id: 'item-id',
            type: 'MATERIAL',
            description: 'Material',
            quantityInThousand: 1_500n,
            unitAmountInCents: 2_000n,
            totalAmountInCents: 3_000n,
            createdAt: now,
            updatedAt: now,
          },
        ],
        additionalTotalInCents: 3_000n,
      },
    };

    const response = toTechnicianWorkOrderResponse(workOrder);
    const serialized = JSON.stringify(response);

    expect(response.number).toBe('OS-000001');
    expect(response.execution?.additionalTotalInCents).toBe('3000');
    expect(serialized).toContain('"sizeBytes":"1024"');
    expect(serialized).toContain('"quantity":"1.5"');
    expect(serialized).toContain('"unitAmountInCents":"2000"');
    expect(serialized).toContain('"totalAmountInCents":"3000"');
  });
});
