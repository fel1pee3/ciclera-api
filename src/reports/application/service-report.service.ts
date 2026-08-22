import { Inject, Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
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
    const brandSymbol = await document.embedPng(
      await readFile(resolve(__dirname, '../assets/ciclera-symbol.png')),
    );
    const number = formatWorkOrderNumber(data.number);
    document.setTitle(`${number} — ${data.title}`);
    document.setAuthor('Ciclera');
    document.setCreator('Ciclera');
    document.setSubject('Relatório de serviço concluído');

    const layout = new PdfLayout(document, font, bold, brandSymbol, {
      number,
      organization: data.organization.name,
      status: statusLabel(data.status),
    });
    layout.hero(data.title, data.serviceType);
    layout.section(
      'Atendimento',
      'Identificação do cliente, local e ativo atendido.',
    );
    layout.infoGrid([
      ['Organização', data.organization.name],
      ['Cliente', data.customer.name],
      ['Documento', formatDocument(data.customer.document)],
      ['Local de atendimento', data.location.name],
      ['Endereço', address(data.location)],
      ['Equipamento', data.equipment?.name ?? 'Sem equipamento específico'],
    ]);
    if (data.equipment) {
      layout.infoGrid([
        ['Identificação', data.equipment.identifier],
        ['Categoria', data.equipment.category],
        ['Marca e modelo', equipmentModel(data.equipment)],
        ['Número de série', data.equipment.serialNumber ?? 'Não informado'],
      ]);
    }
    layout.section('Escopo do serviço', 'Orientações registradas na ordem.');
    layout.textCard('Descrição da ordem', data.description);
    layout.section(
      'Execução em campo',
      'Dados efetivamente registrados durante o atendimento.',
    );
    layout.infoGrid([
      ['Técnico responsável', data.execution.technicianName],
      [
        'Período programado',
        formatDateRange(
          data.scheduledStartAt,
          data.scheduledEndAt,
          data.organization.timezone,
        ),
      ],
      [
        'Início efetivo',
        formatDate(
          data.actualStartAt ?? data.execution.startedAt,
          data.organization.timezone,
        ),
      ],
      [
        'Conclusão efetiva',
        formatDate(data.actualEndAt, data.organization.timezone),
      ],
    ]);
    layout.textCard(
      'Relato técnico',
      data.execution.notes ?? 'Nenhuma observação registrada.',
    );
    layout.section(
      'Materiais, serviços e horas',
      'Itens adicionais confirmados durante a execução.',
    );
    layout.itemsTable(data.additionalItems);
    const additionalTotal = data.additionalItems.reduce(
      (total, item) => total + item.totalAmountInCents,
      0n,
    );
    layout.financialSummary({
      expected: data.expectedAmountInCents ?? 0n,
      additional: additionalTotal,
      final: data.finalAmountInCents,
    });
    layout.section(
      'Evidências do atendimento',
      'Fotos selecionadas para compor este relatório.',
    );
    let photoNumber = 0;
    for (const evidence of data.evidence) {
      const label = `Foto ${++photoNumber}`;
      try {
        const bytes = await this.storage.readObject(evidence.objectKey);
        await layout.image(bytes, evidence.contentType, label);
      } catch {
        layout.notice(
          `${label} indisponível no armazenamento no momento da emissão.`,
        );
      }
    }
    if (!data.evidence.length) {
      layout.notice('Nenhuma evidência foi selecionada para este relatório.');
    }
    layout.closing(
      `Documento gerado a partir dos registros aprovados da ${data.organization.name}. Os valores e horários apresentados refletem o fechamento oficial da ordem.`,
    );
    layout.footer();
    return Buffer.from(await document.save());
  }
}

const palette = {
  primary: rgb(0.03, 0.32, 0.31),
  accent: rgb(0, 0.61, 0.55),
  accentSoft: rgb(0.9, 0.97, 0.96),
  header: rgb(0.93, 0.97, 0.96),
  ink: rgb(0.05, 0.11, 0.12),
  muted: rgb(0.34, 0.4, 0.4),
  border: rgb(0.82, 0.87, 0.86),
  surface: rgb(0.96, 0.98, 0.97),
  white: rgb(1, 1, 1),
};

class PdfLayout {
  private page!: PDFPage;
  private y = 0;
  private readonly margin = 38;
  private readonly pageWidth = 595.28;
  private readonly pageHeight = 841.89;
  private readonly footerLimit = 52;
  private readonly contentWidth = this.pageWidth - this.margin * 2;

  constructor(
    private readonly document: PDFDocument,
    private readonly font: PDFFont,
    private readonly bold: PDFFont,
    private readonly brandSymbol: PDFImage,
    private readonly identity: {
      number: string;
      organization: string;
      status: string;
    },
  ) {
    this.newPage();
  }

  hero(title: string, serviceType: string) {
    const titleLines = wrapText(
      pdfSafe(title),
      this.bold,
      21,
      this.contentWidth - 42,
    );
    const height = 70 + titleLines.length * 24;
    this.ensure(height);
    const top = this.y;
    this.page.drawRectangle({
      x: this.margin,
      y: top - height,
      width: this.contentWidth,
      height,
      color: palette.accentSoft,
      borderColor: rgb(0.69, 0.84, 0.82),
      borderWidth: 0.8,
    });
    this.page.drawRectangle({
      x: this.margin,
      y: top - height,
      width: 5,
      height,
      color: palette.accent,
    });
    this.drawText(
      'SERVIÇO REALIZADO',
      this.margin + 20,
      top - 25,
      8,
      this.bold,
      {
        color: palette.primary,
      },
    );
    let lineY = top - 52;
    for (const line of titleLines) {
      this.drawText(line, this.margin + 20, lineY, 21, this.bold);
      lineY -= 24;
    }
    this.drawText(
      serviceType,
      this.margin + 20,
      top - height + 18,
      10,
      this.font,
      { color: palette.muted },
    );
    this.y = top - height - 14;
  }

  section(title: string, description?: string) {
    const height = description ? 43 : 28;
    this.ensure(height + 8);
    this.y -= 9;
    this.page.drawRectangle({
      x: this.margin,
      y: this.y - 15,
      width: 4,
      height: 17,
      color: palette.accent,
    });
    this.drawText(title, this.margin + 12, this.y - 12, 14, this.bold);
    this.y -= 24;
    if (description) {
      this.drawText(description, this.margin + 12, this.y - 2, 9, this.font, {
        color: palette.muted,
      });
      this.y -= 18;
    }
  }

  infoGrid(fields: Array<[string, string]>) {
    const gap = 10;
    const width = (this.contentWidth - gap) / 2;
    for (let index = 0; index < fields.length; index += 2) {
      const row = fields.slice(index, index + 2).map(([label, value]) => ({
        label,
        lines: wrapText(pdfSafe(value || '—'), this.font, 10, width - 24),
      }));
      const height = Math.max(
        54,
        ...row.map((field) => 34 + field.lines.length * 14),
      );
      this.ensure(height + 10);
      const top = this.y;
      row.forEach((field, column) => {
        const x = this.margin + column * (width + gap);
        this.page.drawRectangle({
          x,
          y: top - height,
          width,
          height,
          color: palette.surface,
          borderColor: palette.border,
          borderWidth: 0.65,
        });
        this.drawText(
          field.label.toUpperCase(),
          x + 12,
          top - 18,
          7.5,
          this.bold,
          { color: palette.muted },
        );
        let valueY = top - 38;
        for (const line of field.lines) {
          this.drawText(line, x + 12, valueY, 10, this.font);
          valueY -= 14;
        }
      });
      this.y = top - height - gap;
    }
  }

  textCard(title: string, value: string) {
    const lines = wrapText(
      pdfSafe(value || '—'),
      this.font,
      10,
      this.contentWidth - 28,
    );
    let offset = 0;
    while (offset < lines.length) {
      if (this.availableHeight() < 78) this.newPage();
      const capacity = Math.max(
        1,
        Math.floor((this.availableHeight() - 44) / 14),
      );
      const chunk = lines.slice(offset, offset + capacity);
      const height = 42 + chunk.length * 14;
      const top = this.y;
      this.page.drawRectangle({
        x: this.margin,
        y: top - height,
        width: this.contentWidth,
        height,
        color: palette.surface,
        borderColor: palette.border,
        borderWidth: 0.65,
      });
      this.drawText(
        offset === 0 ? title : `${title} — continuação`,
        this.margin + 14,
        top - 20,
        9,
        this.bold,
        { color: palette.primary },
      );
      let lineY = top - 40;
      for (const line of chunk) {
        this.drawText(line, this.margin + 14, lineY, 10, this.font);
        lineY -= 14;
      }
      this.y = top - height - 10;
      offset += chunk.length;
    }
  }

  itemsTable(items: ServiceReportData['additionalItems']) {
    if (!items.length) {
      this.notice('Nenhum material, serviço ou hora adicional foi registrado.');
      return;
    }
    this.drawTableHeader();
    for (const [index, item] of items.entries()) {
      const description = `${additionalItemLabel(item.type)} · ${item.description}`;
      const lines = wrapText(pdfSafe(description), this.font, 9, 238);
      const height = Math.max(34, 16 + lines.length * 12);
      if (this.ensure(height)) this.drawTableHeader();
      const top = this.y;
      this.page.drawRectangle({
        x: this.margin,
        y: top - height,
        width: this.contentWidth,
        height,
        color: index % 2 === 0 ? palette.white : palette.surface,
        borderColor: palette.border,
        borderWidth: 0.5,
      });
      let descriptionY = top - 18;
      for (const line of lines) {
        this.drawText(line, this.margin + 10, descriptionY, 9, this.font);
        descriptionY -= 12;
      }
      this.drawText(
        formatQuantity(item.quantityInThousand),
        this.margin + 266,
        top - 20,
        9,
        this.font,
      );
      this.drawRightText(
        money(item.unitAmountInCents),
        this.margin + 409,
        top - 20,
        9,
        this.font,
      );
      this.drawRightText(
        money(item.totalAmountInCents),
        this.margin + this.contentWidth - 10,
        top - 20,
        9,
        this.bold,
      );
      this.y = top - height;
    }
    this.y -= 10;
  }

  financialSummary(values: {
    expected: bigint;
    additional: bigint;
    final: bigint;
  }) {
    const gap = 8;
    const width = (this.contentWidth - gap * 2) / 3;
    const height = 64;
    this.ensure(height + 8);
    const top = this.y;
    const cards: Array<[string, bigint, boolean]> = [
      ['VALOR PREVISTO', values.expected, false],
      ['ITENS ADICIONAIS', values.additional, false],
      ['VALOR FINAL APROVADO', values.final, true],
    ];
    cards.forEach(([label, value, highlighted], index) => {
      const x = this.margin + index * (width + gap);
      this.page.drawRectangle({
        x,
        y: top - height,
        width,
        height,
        color: highlighted ? palette.primary : palette.surface,
        borderColor: highlighted ? palette.primary : palette.border,
        borderWidth: 0.7,
      });
      this.drawText(label, x + 11, top - 20, 7, this.bold, {
        color: highlighted ? palette.white : palette.muted,
      });
      this.drawText(money(value), x + 11, top - 46, 15, this.bold, {
        color: highlighted ? palette.white : palette.primary,
      });
    });
    this.y = top - height - 10;
  }

  async image(bytes: Buffer, contentType: string, label: string) {
    const image =
      contentType === 'image/png'
        ? await this.document.embedPng(bytes)
        : contentType === 'image/jpeg'
          ? await this.document.embedJpg(bytes)
          : null;
    if (!image) {
      this.notice(`${label}: formato não suportado neste relatório.`);
      return;
    }
    const scaled = image.scaleToFit(this.contentWidth - 28, 265);
    const height = scaled.height + 48;
    this.ensure(height + 10);
    const top = this.y;
    this.page.drawRectangle({
      x: this.margin,
      y: top - height,
      width: this.contentWidth,
      height,
      color: palette.surface,
      borderColor: palette.border,
      borderWidth: 0.65,
    });
    this.drawText(label, this.margin + 14, top - 20, 9, this.bold, {
      color: palette.primary,
    });
    this.page.drawImage(image, {
      x: this.margin + (this.contentWidth - scaled.width) / 2,
      y: top - height + 12,
      width: scaled.width,
      height: scaled.height,
    });
    this.y = top - height - 10;
  }

  notice(value: string) {
    const lines = wrapText(
      pdfSafe(value),
      this.font,
      9,
      this.contentWidth - 34,
    );
    const height = 25 + lines.length * 13;
    this.ensure(height + 8);
    const top = this.y;
    this.page.drawRectangle({
      x: this.margin,
      y: top - height,
      width: this.contentWidth,
      height,
      color: palette.surface,
      borderColor: palette.border,
      borderWidth: 0.65,
    });
    this.page.drawEllipse({
      x: this.margin + 15,
      y: top - 19,
      xScale: 3,
      yScale: 3,
      color: palette.accent,
    });
    let lineY = top - 22;
    for (const line of lines) {
      this.drawText(line, this.margin + 28, lineY, 9, this.font, {
        color: palette.muted,
      });
      lineY -= 13;
    }
    this.y = top - height - 8;
  }

  closing(value: string) {
    this.ensure(76);
    this.y -= 8;
    const top = this.y;
    this.page.drawRectangle({
      x: this.margin,
      y: top - 58,
      width: this.contentWidth,
      height: 58,
      color: palette.accentSoft,
      borderColor: rgb(0.69, 0.84, 0.82),
      borderWidth: 0.7,
    });
    this.drawText(
      'RELATÓRIO CONSOLIDADO',
      this.margin + 14,
      top - 18,
      7.5,
      this.bold,
      { color: palette.primary },
    );
    const lines = wrapText(
      pdfSafe(value),
      this.font,
      8.5,
      this.contentWidth - 28,
    );
    let lineY = top - 36;
    for (const line of lines.slice(0, 2)) {
      this.drawText(line, this.margin + 14, lineY, 8.5, this.font, {
        color: palette.muted,
      });
      lineY -= 12;
    }
    this.y = top - 66;
  }

  footer() {
    for (const [index, page] of this.document.getPages().entries()) {
      page.drawLine({
        start: { x: this.margin, y: 38 },
        end: { x: this.pageWidth - this.margin, y: 38 },
        thickness: 0.6,
        color: palette.border,
      });
      const footerSymbol = this.brandSymbol.scaleToFit(17, 17);
      page.drawImage(this.brandSymbol, {
        x: this.margin,
        y: 18,
        width: footerSymbol.width,
        height: footerSymbol.height,
      });
      page.drawText(
        pdfSafe(
          `Ciclera · ${this.identity.number} · ${this.identity.organization}`,
        ),
        {
          x: this.margin + 22,
          y: 21,
          size: 7.5,
          font: this.font,
          color: palette.muted,
        },
      );
      const pageLabel = `Página ${index + 1} de ${this.document.getPageCount()}`;
      page.drawText(pdfSafe(pageLabel), {
        x:
          this.pageWidth -
          this.margin -
          this.font.widthOfTextAtSize(pdfSafe(pageLabel), 7.5),
        y: 21,
        size: 7.5,
        font: this.font,
        color: palette.muted,
      });
    }
  }

  private drawTableHeader() {
    const height = 28;
    this.ensure(height);
    const top = this.y;
    this.page.drawRectangle({
      x: this.margin,
      y: top - height,
      width: this.contentWidth,
      height,
      color: palette.primary,
    });
    this.drawText('DESCRIÇÃO', this.margin + 10, top - 18, 7.5, this.bold, {
      color: palette.white,
    });
    this.drawText('QTD.', this.margin + 266, top - 18, 7.5, this.bold, {
      color: palette.white,
    });
    this.drawRightText(
      'UNITÁRIO',
      this.margin + 409,
      top - 18,
      7.5,
      this.bold,
      palette.white,
    );
    this.drawRightText(
      'TOTAL',
      this.margin + this.contentWidth - 10,
      top - 18,
      7.5,
      this.bold,
      palette.white,
    );
    this.y = top - height;
  }

  private drawRightText(
    value: string,
    right: number,
    y: number,
    size: number,
    font: PDFFont,
    color = palette.ink,
  ) {
    const safe = pdfSafe(value);
    this.drawText(
      safe,
      right - font.widthOfTextAtSize(safe, size),
      y,
      size,
      font,
      { color },
    );
  }

  private drawText(
    value: string,
    x: number,
    y: number,
    size: number,
    font: PDFFont,
    options: { color?: ReturnType<typeof rgb> } = {},
  ) {
    this.page.drawText(pdfSafe(value), {
      x,
      y,
      size,
      font,
      color: options.color ?? palette.ink,
    });
  }

  private ensure(height: number): boolean {
    if (this.y - height >= this.footerLimit) return false;
    this.newPage();
    return true;
  }

  private availableHeight() {
    return this.y - this.footerLimit;
  }

  private newPage() {
    this.page = this.document.addPage([this.pageWidth, this.pageHeight]);
    const headerHeight = 96;
    const headerY = this.pageHeight - headerHeight;
    this.page.drawRectangle({
      x: 0,
      y: headerY,
      width: this.pageWidth,
      height: headerHeight,
      color: palette.header,
    });
    this.page.drawLine({
      start: { x: 0, y: headerY },
      end: { x: this.pageWidth, y: headerY },
      thickness: 2,
      color: palette.accent,
    });
    const headerSymbol = this.brandSymbol.scaleToFit(38, 38);
    this.page.drawImage(this.brandSymbol, {
      x: this.margin,
      y: headerY + 50 - headerSymbol.height / 2,
      width: headerSymbol.width,
      height: headerSymbol.height,
    });
    this.page.drawText('Ciclera', {
      x: this.margin + 42,
      y: headerY + 48,
      size: 18,
      font: this.bold,
      color: palette.ink,
    });
    this.page.drawText('RELATÓRIO DE SERVIÇO', {
      x: this.margin + 42,
      y: headerY + 28,
      size: 7.5,
      font: this.bold,
      color: palette.primary,
    });
    const safeStatus = pdfSafe(this.identity.status);
    const statusWidth = this.bold.widthOfTextAtSize(safeStatus, 8);
    const pillWidth = statusWidth + 22;
    this.page.drawRectangle({
      x: this.pageWidth - this.margin - pillWidth,
      y: headerY + 22,
      width: pillWidth,
      height: 22,
      color: rgb(0.08, 0.42, 0.39),
      borderColor: rgb(0.2, 0.55, 0.51),
      borderWidth: 0.6,
    });
    this.page.drawText(safeStatus, {
      x: this.pageWidth - this.margin - pillWidth + 11,
      y: headerY + 29,
      size: 8,
      font: this.bold,
      color: palette.white,
    });
    const safeNumber = pdfSafe(this.identity.number);
    const numberWidth = this.bold.widthOfTextAtSize(safeNumber, 18);
    this.page.drawText(safeNumber, {
      x: this.pageWidth - this.margin - numberWidth,
      y: headerY + 56,
      size: 18,
      font: this.bold,
      color: palette.primary,
    });
    this.y = headerY - 22;
  }
}

function wrapText(
  value: string,
  font: PDFFont,
  size: number,
  maximumWidth: number,
): string[] {
  return value.split(/\r?\n/).flatMap((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const candidate = `${line} ${word}`.trim();
      if (
        font.widthOfTextAtSize(pdfSafe(candidate), size) > maximumWidth &&
        line
      ) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
    return lines;
  });
}

function pdfSafe(value: string): string {
  const withoutControls = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('');
  return withoutControls
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/[^\u0020-\u007e\u00a0-\u00ff\u2013\u2014\u2022]/g, '');
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

function equipmentModel(value: NonNullable<ServiceReportData['equipment']>) {
  return (
    [value.brand, value.model].filter(Boolean).join(' · ') || 'Não informado'
  );
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
  const integer = (absolute / 100n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const formatted = `${integer},${(absolute % 100n).toString().padStart(2, '0')}`;
  return `${value < 0n ? '-' : ''}R$ ${formatted}`;
}

function formatDateRange(
  start: Date | null,
  end: Date | null,
  timezone: string,
) {
  if (!start && !end) return 'Não informado';
  return `${formatDate(start, timezone)} — ${formatDate(end, timezone)}`;
}

function formatDocument(value: string | null) {
  if (!value) return 'Não informado';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      '$1.$2.$3/$4-$5',
    );
  }
  return value;
}

function additionalItemLabel(value: string) {
  const labels: Record<string, string> = {
    MATERIAL: 'Material',
    SERVICE: 'Serviço',
    ADDITIONAL_HOUR: 'Hora adicional',
  };
  return labels[value] ?? 'Item';
}

function statusLabel(value: ServiceReportData['status']) {
  return value === 'BILLED' ? 'Faturada' : 'Pronta para faturar';
}
