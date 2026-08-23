import {
  ForbiddenException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import {
  initialDataTemplate,
  parseInitialDataCsv,
  type ParsedInitialData,
} from '../domain/initial-data-import';
import {
  createInitialDataWorkbook,
  initialDataWorkbookToCsv,
} from '../domain/initial-data-workbook';
import {
  INITIAL_DATA_IMPORT_REPOSITORY,
  type InitialDataImportRepository,
} from './ports/initial-data-import.repository';

@Injectable()
export class InitialDataImportService {
  constructor(
    @Inject(INITIAL_DATA_IMPORT_REPOSITORY)
    private readonly imports: InitialDataImportRepository,
  ) {}

  template(principal: AuthenticatedPrincipal) {
    this.requireOwner(principal);
    return initialDataTemplate;
  }

  templateWorkbook(principal: AuthenticatedPrincipal) {
    this.requireOwner(principal);
    return createInitialDataWorkbook();
  }

  async preview(principal: AuthenticatedPrincipal, content: string) {
    this.requireOwner(principal);
    const data = this.parse(content);
    return this.previewData(principal, data);
  }

  async previewWorkbook(principal: AuthenticatedPrincipal, file: Buffer) {
    this.requireOwner(principal);
    const data = this.parse(await this.readWorkbook(file));
    return this.previewData(principal, data);
  }

  private async previewData(
    principal: AuthenticatedPrincipal,
    data: ParsedInitialData,
  ) {
    const conflicts = await this.imports.inspect(
      principal.organizationId,
      data,
    );
    mergeErrors(data, conflicts);
    return preview(data);
  }

  async commit(
    principal: AuthenticatedPrincipal,
    requestId: string,
    input: { content: string; checksum: string },
  ) {
    this.requireOwner(principal);
    const data = this.parse(input.content);
    return this.commitData(principal, requestId, data, input.checksum);
  }

  async commitWorkbook(
    principal: AuthenticatedPrincipal,
    requestId: string,
    file: Buffer,
    checksum: string,
  ) {
    this.requireOwner(principal);
    const data = this.parse(await this.readWorkbook(file));
    return this.commitData(principal, requestId, data, checksum);
  }

  private async commitData(
    principal: AuthenticatedPrincipal,
    requestId: string,
    data: ParsedInitialData,
    checksum: string,
  ) {
    if (data.checksum !== checksum) {
      throw invalidImport(
        'O arquivo mudou depois da prévia. Gere uma nova prévia.',
      );
    }
    if (data.rows.some((row) => row.errors.length)) {
      throw invalidImport('Corrija todas as linhas antes de importar.', data);
    }
    const result = await this.imports.commit({
      organizationId: principal.organizationId,
      actorUserId: principal.userId,
      requestId,
      data,
    });
    if (result.status === 'INVALID') {
      mergeErrors(data, result.errors);
      throw invalidImport('Os dados mudaram depois da prévia.', data);
    }
    return result;
  }

  private async readWorkbook(file: Buffer) {
    try {
      return await initialDataWorkbookToCsv(file);
    } catch (error: unknown) {
      const messages: Record<string, string> = {
        IMPORT_XLSX_SIZE_INVALID:
          'A planilha Excel deve possuir entre 1 byte e 500 KB.',
        IMPORT_XLSX_SHEET_INVALID:
          'A aba "Dados para importar" não foi encontrada.',
        IMPORT_XLSX_HEADERS_INVALID:
          'Não altere os títulos das colunas da planilha oficial.',
        IMPORT_XLSX_CELL_INVALID:
          'A planilha não aceita fórmulas, links ou valores complexos.',
        IMPORT_ROW_LIMIT_EXCEEDED: 'A planilha aceita no máximo 500 linhas.',
      };
      const code = error instanceof Error ? error.message : '';
      throw invalidImport(
        messages[code] ?? 'A planilha Excel informada é inválida.',
      );
    }
  }

  private parse(content: string) {
    try {
      return parseInitialDataCsv(content);
    } catch (error: unknown) {
      const messages: Record<string, string> = {
        IMPORT_FILE_SIZE_INVALID: 'O CSV deve possuir entre 1 byte e 90 KB.',
        IMPORT_HEADERS_INVALID: 'Use exatamente as colunas do modelo oficial.',
        IMPORT_ROW_LIMIT_EXCEEDED: 'O CSV aceita no máximo 500 linhas.',
        IMPORT_CSV_INVALID: 'O CSV possui aspas ou estrutura inválida.',
      };
      const code = error instanceof Error ? error.message : '';
      throw invalidImport(messages[code] ?? 'O CSV informado é inválido.');
    }
  }

  private requireOwner(principal: AuthenticatedPrincipal) {
    if (principal.role !== 'OWNER') {
      throw new ForbiddenException(
        'Somente proprietários podem importar dados.',
      );
    }
  }
}

function mergeErrors(data: ParsedInitialData, errors: Map<number, string[]>) {
  for (const [line, messages] of errors) {
    const row = data.rows.find((item) => item.line === line);
    if (row) row.errors.push(...messages);
  }
}

function preview(data: ParsedInitialData) {
  const valid = data.rows.filter((row) => !row.errors.length).length;
  return {
    checksum: data.checksum,
    ready: valid === data.rows.length && data.rows.length > 0,
    totals: {
      total: data.rows.length,
      valid,
      invalid: data.rows.length - valid,
    },
    entities: {
      customers: data.customers.length,
      locations: data.locations.length,
      equipment: data.equipment.length,
    },
    rows: data.rows.map((row) => ({
      ...row,
      status: row.errors.length ? ('INVALID' as const) : ('VALID' as const),
    })),
  };
}

function invalidImport(detail: string, data?: ParsedInitialData) {
  return new UnprocessableEntityException({
    type: 'https://ciclera.com.br/problems/initial-data-import-invalid',
    title: 'Importação inválida',
    detail,
    code: 'INITIAL_DATA_IMPORT_INVALID',
    ...(data
      ? {
          fieldErrors: Object.fromEntries(
            data.rows
              .filter((row) => row.errors.length)
              .map((row) => [`line.${row.line}`, row.errors]),
          ),
        }
      : {}),
  });
}
