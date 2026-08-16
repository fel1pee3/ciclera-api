import { createHash } from 'node:crypto';
import {
  displayText,
  normalizedDocument,
  normalizedText,
  optionalText,
} from '../../customers/domain/normalization';

export const importHeaders = [
  'type',
  'external_key',
  'parent_external_key',
  'name',
  'document',
  'postal_code',
  'street',
  'number',
  'complement',
  'neighborhood',
  'city',
  'state',
  'identifier',
  'category',
  'brand',
  'model',
  'serial_number',
] as const;

export const initialDataTemplate = `\uFEFF${importHeaders.join(';')}\r\nCLIENT;customer-1;;Cliente Exemplo;00000000000;;;;;;;;;;;;\r\nLOCATION;location-1;customer-1;Matriz;;01000-000;Rua Exemplo;100;;Centro;São Paulo;SP;;;;;\r\nEQUIPMENT;equipment-1;location-1;Equipamento Exemplo;;;;;;;;;EQ-001;Climatização;Marca;Modelo;SERIE-001\r\n`;

interface ImportBase {
  line: number;
  externalKey: string;
  name: string;
  normalizedName: string;
}

export interface ImportCustomer extends ImportBase {
  type: 'CLIENT';
  document: string | null;
  normalizedDocument: string | null;
}

export interface ImportLocation extends ImportBase {
  type: 'LOCATION';
  parentExternalKey: string;
  postalCode: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
}

export interface ImportEquipment extends ImportBase {
  type: 'EQUIPMENT';
  parentExternalKey: string;
  identifier: string;
  normalizedIdentifier: string;
  category: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  normalizedSerialNumber: string | null;
}

export interface ParsedInitialData {
  checksum: string;
  customers: ImportCustomer[];
  locations: ImportLocation[];
  equipment: ImportEquipment[];
  rows: Array<{
    line: number;
    type: string;
    externalKey: string;
    errors: string[];
  }>;
}

export function parseInitialDataCsv(content: string): ParsedInitialData {
  const byteLength = Buffer.byteLength(content, 'utf8');
  if (!byteLength || byteLength > 90_000) {
    throw new Error('IMPORT_FILE_SIZE_INVALID');
  }
  const table = parseCsv(content.replace(/^\uFEFF/, ''));
  if (!sameHeaders(table[0]?.cells ?? [])) {
    throw new Error('IMPORT_HEADERS_INVALID');
  }
  if (table.length - 1 > 500) throw new Error('IMPORT_ROW_LIMIT_EXCEEDED');
  const customers: ImportCustomer[] = [];
  const locations: ImportLocation[] = [];
  const equipment: ImportEquipment[] = [];
  const rows: ParsedInitialData['rows'] = [];
  const keys = new Map<string, number>();
  for (const record of table.slice(1)) {
    if (record.cells.every((cell) => !cell.trim())) continue;
    const values = Object.fromEntries(
      importHeaders.map((header, index) => [
        header,
        record.cells[index]?.trim() ?? '',
      ]),
    );
    const type = values.type.toUpperCase();
    const externalKey = values.external_key;
    const errors: string[] = [];
    if (!['CLIENT', 'LOCATION', 'EQUIPMENT'].includes(type))
      errors.push('Tipo deve ser CLIENT, LOCATION ou EQUIPMENT.');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(externalKey))
      errors.push('external_key inválida.');
    if (!values.name || values.name.length > 160)
      errors.push('Nome é obrigatório e deve ter até 160 caracteres.');
    const uniqueKey = `${type}:${externalKey}`;
    if (keys.has(uniqueKey))
      errors.push(
        `external_key duplicada (primeira ocorrência na linha ${keys.get(uniqueKey)}).`,
      );
    else keys.set(uniqueKey, record.line);
    if (type === 'CLIENT' && values.parent_external_key)
      errors.push('CLIENT não aceita parent_external_key.');
    if (
      (type === 'LOCATION' || type === 'EQUIPMENT') &&
      !values.parent_external_key
    )
      errors.push('parent_external_key é obrigatória.');
    if (type === 'LOCATION') {
      for (const [field, label] of [
        ['postal_code', 'CEP'],
        ['street', 'Logradouro'],
        ['number', 'Número'],
        ['neighborhood', 'Bairro'],
        ['city', 'Cidade'],
        ['state', 'UF'],
      ] as const)
        if (!values[field]) errors.push(`${label} é obrigatório.`);
      if (values.state && !/^[A-Za-z]{2}$/.test(values.state))
        errors.push('UF deve possuir duas letras.');
    }
    if (type === 'EQUIPMENT') {
      if (!values.identifier) errors.push('Identificador é obrigatório.');
      if (!values.category) errors.push('Categoria é obrigatória.');
    }
    rows.push({ line: record.line, type, externalKey, errors });
    if (errors.length) continue;
    const base = {
      line: record.line,
      externalKey,
      name: displayText(values.name),
      normalizedName: normalizedText(values.name),
    };
    if (type === 'CLIENT') {
      customers.push({
        ...base,
        type,
        document: optionalText(values.document),
        normalizedDocument: normalizedDocument(values.document),
      });
    } else if (type === 'LOCATION') {
      locations.push({
        ...base,
        type,
        parentExternalKey: values.parent_external_key,
        postalCode: displayText(values.postal_code),
        street: displayText(values.street),
        number: displayText(values.number),
        complement: optionalText(values.complement),
        neighborhood: displayText(values.neighborhood),
        city: displayText(values.city),
        state: values.state.toUpperCase(),
      });
    } else if (type === 'EQUIPMENT') {
      equipment.push({
        ...base,
        type,
        parentExternalKey: values.parent_external_key,
        identifier: displayText(values.identifier),
        normalizedIdentifier: normalizedText(values.identifier),
        category: displayText(values.category),
        brand: optionalText(values.brand),
        model: optionalText(values.model),
        serialNumber: optionalText(values.serial_number),
        normalizedSerialNumber: normalizedText(values.serial_number) || null,
      });
    }
  }
  const customerKeys = new Set(customers.map((item) => item.externalKey));
  const locationKeys = new Set(locations.map((item) => item.externalKey));
  for (const location of locations) {
    if (!customerKeys.has(location.parentExternalKey))
      row(rows, location.line).errors.push(
        'Cliente pai não encontrado no arquivo.',
      );
  }
  for (const item of equipment) {
    if (!locationKeys.has(item.parentExternalKey))
      row(rows, item.line).errors.push('Local pai não encontrado no arquivo.');
  }
  flagDuplicateBusinessKeys(customers, equipment, rows);
  return {
    checksum: createHash('sha256').update(content, 'utf8').digest('hex'),
    customers,
    locations,
    equipment,
    rows,
  };
}

function flagDuplicateBusinessKeys(
  customers: ImportCustomer[],
  equipment: ImportEquipment[],
  rows: ParsedInitialData['rows'],
) {
  const customerNames = new Map<string, number>();
  const customerDocuments = new Map<string, number>();
  for (const customer of customers) {
    flagDuplicate(
      customerNames,
      customer.normalizedName,
      customer.line,
      rows,
      'Cliente duplicado por nome no arquivo.',
    );
    if (customer.normalizedDocument) {
      flagDuplicate(
        customerDocuments,
        customer.normalizedDocument,
        customer.line,
        rows,
        'Cliente duplicado por documento no arquivo.',
      );
    }
  }
  const equipmentIdentifiers = new Map<string, number>();
  const equipmentSerials = new Map<string, number>();
  for (const item of equipment) {
    flagDuplicate(
      equipmentIdentifiers,
      item.normalizedIdentifier,
      item.line,
      rows,
      'Equipamento duplicado por identificador no arquivo.',
    );
    if (item.normalizedSerialNumber) {
      flagDuplicate(
        equipmentSerials,
        item.normalizedSerialNumber,
        item.line,
        rows,
        'Equipamento duplicado por número de série no arquivo.',
      );
    }
  }
}

function flagDuplicate(
  values: Map<string, number>,
  key: string,
  line: number,
  rows: ParsedInitialData['rows'],
  message: string,
) {
  const firstLine = values.get(key);
  if (firstLine) {
    row(rows, line).errors.push(
      `${message} Primeira ocorrência: linha ${firstLine}.`,
    );
    return;
  }
  values.set(key, line);
}

function parseCsv(content: string): Array<{ line: number; cells: string[] }> {
  const records: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = [];
  let value = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (char === '"') {
      if (quoted && content[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === ';' && !quoted) {
      cells.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && content[index + 1] === '\n') index += 1;
      cells.push(value);
      records.push({ line: recordLine, cells });
      cells = [];
      value = '';
      line += 1;
      recordLine = line;
    } else {
      value += char;
      if (char === '\n') line += 1;
    }
  }
  if (quoted) throw new Error('IMPORT_CSV_INVALID');
  if (value || cells.length) {
    cells.push(value);
    records.push({ line: recordLine, cells });
  }
  return records;
}

function sameHeaders(headers: string[]): boolean {
  return (
    headers.length === importHeaders.length &&
    importHeaders.every((value, index) => headers[index] === value)
  );
}

function row(rows: ParsedInitialData['rows'], line: number) {
  const result = rows.find((item) => item.line === line);
  if (!result) throw new Error('IMPORT_ROW_NOT_FOUND');
  return result;
}
