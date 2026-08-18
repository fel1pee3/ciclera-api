import { Inject, Injectable } from '@nestjs/common';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import {
  EVIDENCE_STORAGE,
  type EvidenceStorage,
} from '../../evidence/application/ports/evidence-storage.port';
import {
  WorkOrderManagementForbiddenError,
  WorkOrderNotFoundError,
} from '../../work-orders/domain/work-order.errors';
import { formatWorkOrderNumber } from '../../work-orders/domain/work-order';
import { formatQuantity } from '../../additional-items/domain/additional-item';
import {
  REPORT_REPOSITORY,
  type ReportRepository,
  type ServiceReportData,
} from './ports/report.repository';

@Injectable()
export class ServiceReportService {
  constructor(
    @Inject(REPORT_REPOSITORY) private readonly reports: ReportRepository,
    @Inject(EVIDENCE_STORAGE) private readonly storage: EvidenceStorage,
  ) {}

  async generate(principal: AuthenticatedPrincipal, workOrderId: string) {
    if (principal.role === 'TECHNICIAN') {
      throw new WorkOrderManagementForbiddenError();
    }
    const data = await this.reports.findServiceReport({
      organizationId: principal.organizationId,
      workOrderId,
    });
    if (!data) throw new WorkOrderNotFoundError();
    return {
      fileName: `relatorio-${formatWorkOrderNumber(data.number)}.pdf`,
      content: await this.render(data),
    };
  }

  private async render(data: ServiceReportData): Promise<Buffer> {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    const layout = new PdfLayout(document, font, bold);
    layout.heading('Relatório de serviço');
    layout.text(`${formatWorkOrderNumber(data.number)} · ${data.status}`);
    layout.section('Organização e atendimento');
    layout.field('Organização', data.organization.name);
    layout.field('Cliente', data.customer.name);
    layout.field('Documento', data.customer.document ?? 'Não informado');
    layout.field('Local', `${data.location.name} — ${address(data.location)}`);
    layout.field('Equipamento', equipment(data.equipment));
    layout.field('Serviço', `${data.serviceType} — ${data.title}`);
    layout.text(data.description);
    layout.section('Execução');
    layout.field('Técnico', data.execution.technicianName);
    layout.field(
      'Início',
      formatDate(
        data.actualStartAt ?? data.execution.startedAt,
        data.organization.timezone,
      ),
    );
    layout.field(
      'Conclusão',
      formatDate(data.actualEndAt, data.organization.timezone),
    );
    layout.field('Observações', data.execution.notes ?? 'Sem observações.');
    layout.section('Itens e valores');
    for (const item of data.additionalItems) {
      layout.text(
        `${item.description} · ${formatQuantity(item.quantityInThousand)} × ${money(item.unitAmountInCents)} = ${money(item.totalAmountInCents)}`,
      );
    }
    if (!data.additionalItems.length) layout.text('Nenhum item adicional.');
    layout.field('Valor previsto', money(data.expectedAmountInCents ?? 0n));
    layout.field('Valor final aprovado', money(data.finalAmountInCents));
    layout.section('Evidências selecionadas');
    for (const evidence of data.evidence) {
      try {
        const bytes = await this.storage.readObject(evidence.objectKey);
        await layout.image(
          bytes,
          evidence.contentType,
          evidence.kind === 'SIGNATURE' ? 'Assinatura' : 'Foto',
        );
      } catch {
        layout.text(
          `${evidence.kind === 'SIGNATURE' ? 'Assinatura' : 'Foto'} indisponível no storage local.`,
        );
      }
    }
    if (!data.evidence.length) layout.text('Nenhuma evidência selecionada.');
    layout.footer();
    return Buffer.from(await document.save());
  }
}

class PdfLayout {
  private page!: PDFPage;
  private y = 0;
  private readonly margin = 48;

  constructor(
    private readonly document: PDFDocument,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.newPage();
  }

  heading(value: string) {
    this.lines(value, 22, this.bold, rgb(0.03, 0.35, 0.31));
  }

  section(value: string) {
    this.y -= 8;
    this.ensure(28);
    this.lines(value, 14, this.bold);
  }

  field(label: string, value: string) {
    this.lines(`${label}: ${value}`, 10, this.font);
  }

  text(value: string) {
    this.lines(value, 10, this.font);
  }

  async image(bytes: Buffer, contentType: string, label: string) {
    const image =
      contentType === 'image/png'
        ? await this.document.embedPng(bytes)
        : contentType === 'image/jpeg'
          ? await this.document.embedJpg(bytes)
          : null;
    if (!image) {
      this.text(`${label}: formato não incorporado ao relatório.`);
      return;
    }
    const scaled = image.scaleToFit(470, 260);
    this.ensure(scaled.height + 30);
    this.lines(label, 10, this.bold);
    this.page.drawImage(image, {
      x: this.margin,
      y: this.y - scaled.height,
      width: scaled.width,
      height: scaled.height,
    });
    this.y -= scaled.height + 12;
  }

  footer() {
    for (const [index, page] of this.document.getPages().entries()) {
      page.drawText(
        `Ciclera · página ${index + 1}/${this.document.getPageCount()}`,
        {
          x: this.margin,
          y: 24,
          size: 8,
          font: this.font,
          color: rgb(0.4, 0.45, 0.43),
        },
      );
    }
  }

  private lines(
    value: string,
    size: number,
    font: PDFFont,
    color = rgb(0.09, 0.14, 0.13),
  ) {
    for (const line of wrap(pdfSafe(value || '—'), 88)) {
      this.ensure(size + 6);
      this.page.drawText(line, {
        x: this.margin,
        y: this.y,
        size,
        font,
        color,
      });
      this.y -= size + 5;
    }
  }

  private ensure(height: number) {
    if (this.y - height < 48) this.newPage();
  }

  private newPage() {
    this.page = this.document.addPage([595.28, 841.89]);
    this.y = 793;
  }
}

function wrap(value: string, maximum: number): string[] {
  return value.split(/\r?\n/).flatMap((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      if (`${line} ${word}`.trim().length > maximum && line) {
        lines.push(line);
        line = word;
      } else line = `${line} ${word}`.trim();
    }
    lines.push(line);
    return lines;
  });
}

function pdfSafe(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^ -~]/g, '-');
}

function address(location: ServiceReportData['location']) {
  return [
    `${location.street}, ${location.number}`,
    location.complement,
    location.neighborhood,
    `${location.city}/${location.state}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function equipment(value: ServiceReportData['equipment']) {
  if (!value) return 'Não informado';
  return [
    value.name,
    value.identifier,
    value.category,
    value.brand,
    value.model,
    value.serialNumber,
  ]
    .filter(Boolean)
    .join(' · ');
}

function formatDate(value: Date | null, timezone: string) {
  return value
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: timezone,
      }).format(value)
    : 'Não informado';
}

function money(value: bigint) {
  const absolute = value < 0n ? -value : value;
  const formatted = `${absolute / 100n},${(absolute % 100n).toString().padStart(2, '0')}`;
  return `${value < 0n ? '-' : ''}R$ ${formatted}`;
}
