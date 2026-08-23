import ExcelJS from 'exceljs';
import { importHeaders } from './initial-data-import';

export const initialDataWorkbookFileName = 'modelo-importacao-inicial.xlsx';
export const initialDataWorkbookSheetName = 'Dados para importar';
export const maxInitialDataWorkbookBytes = 500_000;

const workbookHeaders = [
  'Tipo',
  'Chave',
  'Chave pai',
  'Nome',
  'Documento',
  'CEP',
  'Logradouro',
  'Número',
  'Complemento',
  'Bairro',
  'Cidade',
  'UF',
  'Identificação',
  'Categoria',
  'Marca',
  'Modelo',
  'Número de série',
] as const;

const columnWidths = [
  16, 20, 20, 38, 22, 16, 32, 12, 22, 22, 24, 10, 22, 24, 20, 25, 24,
];

const columnNotes = [
  'Use CLIENT para cliente, LOCATION para local e EQUIPMENT para equipamento.',
  'Identificador único desta linha no arquivo. Use letras, números, hífen ou sublinhado.',
  'Para LOCATION, informe a chave do cliente. Para EQUIPMENT, informe a chave do local.',
  'Nome do cliente, unidade ou equipamento.',
  'CPF ou CNPJ. Preenchido somente nas linhas CLIENT.',
  'CEP do local. Preenchido somente nas linhas LOCATION.',
  'Logradouro do local.',
  'Número do endereço.',
  'Complemento opcional do endereço.',
  'Bairro do local.',
  'Cidade do local.',
  'UF com duas letras.',
  'Identificação interna do equipamento.',
  'Categoria do equipamento.',
  'Marca opcional do equipamento.',
  'Modelo opcional do equipamento.',
  'Número de série opcional do equipamento.',
] as const;

const sampleRows = [
  [
    'CLIENT',
    'cliente-1',
    '',
    'Cliente Exemplo Ltda.',
    '00000000000000',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ],
  [
    'LOCATION',
    'local-1',
    'cliente-1',
    'Unidade Centro',
    '',
    '01000-000',
    'Rua Exemplo',
    '100',
    'Bloco A',
    'Centro',
    'São Paulo',
    'SP',
    '',
    '',
    '',
    '',
    '',
  ],
  [
    'EQUIPMENT',
    'equipamento-1',
    'local-1',
    'Ar-condicionado da recepção',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'EQ-001',
    'Climatização',
    'Marca',
    'Modelo',
    'SERIE-001',
  ],
];

export async function createInitialDataWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ciclera';
  workbook.company = 'Ciclera';
  workbook.subject = 'Importação inicial de clientes, locais e equipamentos';
  workbook.title = 'Modelo de importação inicial';
  workbook.created = new Date(0);
  workbook.modified = new Date(0);

  const data = workbook.addWorksheet(initialDataWorkbookSheetName, {
    properties: { defaultRowHeight: 22 },
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  });
  data.columns = workbookHeaders.map((header, index) => ({
    header,
    key: importHeaders[index],
    width: columnWidths[index],
    style: { alignment: { vertical: 'middle' } },
  }));
  data.autoFilter = { from: 'A1', to: 'Q1' };

  const header = data.getRow(1);
  header.height = 34;
  header.eachCell((cell, column) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF006F68' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FFB7EB52' } },
    };
    cell.note = columnNotes[column - 1];
  });

  for (const [index, values] of sampleRows.entries()) {
    const row = data.addRow(values);
    row.height = 29;
    const accent = ['FFE5F4F1', 'FFF0F7F5', 'FFF7FAF9'][index];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: accent },
      };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFD7E3E0' } },
      };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    row.getCell(1).font = { bold: true, color: { argb: 'FF007F73' } };
  }

  for (let row = 2; row <= 501; row += 1) {
    data.getCell(row, 1).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"CLIENT,LOCATION,EQUIPMENT"'],
      showErrorMessage: true,
      errorTitle: 'Tipo inválido',
      error: 'Escolha CLIENT, LOCATION ou EQUIPMENT.',
    };
    for (let column = 1; column <= workbookHeaders.length; column += 1) {
      data.getCell(row, column).numFmt = '@';
    }
  }

  data.getColumn(1).alignment = { vertical: 'middle', horizontal: 'center' };
  data.getColumn(12).alignment = { vertical: 'middle', horizontal: 'center' };
  data.getRow(5).height = 8;

  const instructions = workbook.addWorksheet('Como preencher', {
    properties: { defaultRowHeight: 24 },
    views: [{ showGridLines: false }],
  });
  instructions.columns = [
    { width: 4 },
    { width: 24 },
    { width: 34 },
    { width: 34 },
    { width: 4 },
  ];
  instructions.mergeCells('B2:D3');
  const title = instructions.getCell('B2');
  title.value = 'Ciclera  |  Importação inicial';
  title.font = { bold: true, size: 22, color: { argb: 'FFFFFFFF' } };
  title.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF063B38' },
  };
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  instructions.mergeCells('B5:D5');
  instructions.getCell('B5').value =
    'Cadastre clientes, locais e equipamentos em uma única importação.';
  instructions.getCell('B5').font = {
    bold: true,
    size: 14,
    color: { argb: 'FF102A28' },
  };

  addInstruction(
    instructions,
    7,
    '1. Cliente',
    'Use CLIENT. Crie uma chave exclusiva e deixe Chave pai vazia.',
  );
  addInstruction(
    instructions,
    10,
    '2. Local',
    'Use LOCATION. Em Chave pai, informe a chave do cliente correspondente.',
  );
  addInstruction(
    instructions,
    13,
    '3. Equipamento',
    'Use EQUIPMENT. Em Chave pai, informe a chave do local onde ele está instalado.',
  );

  instructions.mergeCells('B17:D18');
  const warning = instructions.getCell('B17');
  warning.value =
    'Antes de enviar: não altere os títulos das colunas, não repita chaves e mantenha as relações cliente → local → equipamento.';
  warning.font = { bold: true, color: { argb: 'FF5E4A00' } };
  warning.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFF5CC' },
  };
  warning.alignment = { vertical: 'middle', wrapText: true, indent: 1 };

  workbook.views = [
    {
      x: 0,
      y: 0,
      width: 12_000,
      height: 20_000,
      firstSheet: 0,
      activeTab: 0,
      visibility: 'visible',
    },
  ];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function initialDataWorkbookToCsv(file: Buffer): Promise<string> {
  if (!file.length || file.length > maxInitialDataWorkbookBytes) {
    throw new Error('IMPORT_XLSX_SIZE_INVALID');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    file as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const sheet = workbook.getWorksheet(initialDataWorkbookSheetName);
  if (!sheet) throw new Error('IMPORT_XLSX_SHEET_INVALID');

  const headers = workbookHeaders.map((_, index) =>
    cellText(sheet, 1, index + 1),
  );
  if (!sameValues(headers, workbookHeaders)) {
    throw new Error('IMPORT_XLSX_HEADERS_INVALID');
  }
  if (sheet.rowCount - 1 > 500) {
    throw new Error('IMPORT_ROW_LIMIT_EXCEEDED');
  }

  const records = [`\uFEFF${importHeaders.join(';')}`];
  for (let row = 2; row <= sheet.rowCount; row += 1) {
    const values = workbookHeaders.map((_, index) =>
      cellText(sheet, row, index + 1),
    );
    if (values.every((value) => !value.trim())) continue;
    records.push(values.map(csvCell).join(';'));
  }
  return `${records.join('\r\n')}\r\n`;
}

function addInstruction(
  sheet: ExcelJS.Worksheet,
  row: number,
  title: string,
  description: string,
) {
  sheet.mergeCells(row, 2, row, 4);
  const heading = sheet.getCell(row, 2);
  heading.value = title;
  heading.font = { bold: true, size: 12, color: { argb: 'FF007F73' } };
  sheet.mergeCells(row + 1, 2, row + 1, 4);
  const body = sheet.getCell(row + 1, 2);
  body.value = description;
  body.font = { color: { argb: 'FF435A57' } };
  body.alignment = { vertical: 'top', wrapText: true };
}

function cellText(sheet: ExcelJS.Worksheet, row: number, column: number) {
  const cell = sheet.getCell(row, column);
  const value = cell.value;
  if (value && typeof value === 'object' && !('richText' in value)) {
    throw new Error('IMPORT_XLSX_CELL_INVALID');
  }
  return cell.text.trim();
}

function csvCell(value: string) {
  if (!/[;"\r\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function sameValues(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length && left.every((value, i) => value === right[i])
  );
}
