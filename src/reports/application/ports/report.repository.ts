export const REPORT_REPOSITORY = Symbol('REPORT_REPOSITORY');

export interface ServiceReportData {
  id: string;
  number: bigint;
  status: 'READY_TO_BILL' | 'BILLED';
  title: string;
  serviceType: string;
  description: string;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  expectedAmountInCents: bigint | null;
  finalAmountInCents: bigint;
  organization: { name: string; timezone: string };
  customer: { name: string; document: string | null };
  location: {
    name: string;
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
  };
  equipment: {
    name: string;
    identifier: string;
    category: string;
    brand: string | null;
    model: string | null;
    serialNumber: string | null;
  } | null;
  execution: {
    technicianName: string;
    notes: string | null;
    startedAt: Date;
  };
  additionalItems: Array<{
    type: string;
    description: string;
    quantityInThousand: bigint;
    unitAmountInCents: bigint;
    totalAmountInCents: bigint;
  }>;
  evidence: Array<{
    id: string;
    objectKey: string;
    contentType: string;
  }>;
}

export interface ReportRepository {
  findServiceReport(input: {
    organizationId: string;
    workOrderId: string;
  }): Promise<ServiceReportData | null>;
}
