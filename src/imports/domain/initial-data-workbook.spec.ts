import ExcelJS from 'exceljs';
import { parseInitialDataCsv } from './initial-data-import';
import {
  createInitialDataWorkbook,
  initialDataWorkbookSheetName,
  initialDataWorkbookToCsv,
  maxInitialDataWorkbookBytes,
} from './initial-data-workbook';

describe('initial data Excel workbook', () => {
  it('creates a styled official workbook accepted by the import contract', async () => {
    const file = await createInitialDataWorkbook();

    expect(file.subarray(0, 2).toString()).toBe('PK');
    expect(file.length).toBeLessThan(maxInitialDataWorkbookBytes);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(asExcelBuffer(file));
    const sheet = workbook.getWorksheet(initialDataWorkbookSheetName);

    expect(sheet).toBeDefined();
    expect(workbook.getWorksheet('Como preencher')).toBeDefined();
    expect(sheet?.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(sheet?.getCell('A1').fill).toMatchObject({ type: 'pattern' });

    const parsed = parseInitialDataCsv(await initialDataWorkbookToCsv(file));
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows.every((row) => row.errors.length === 0)).toBe(true);
    expect(parsed.customers).toHaveLength(1);
    expect(parsed.locations).toHaveLength(1);
    expect(parsed.equipment).toHaveLength(1);
  });

  it('rejects formulas instead of evaluating untrusted spreadsheet content', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(asExcelBuffer(await createInitialDataWorkbook()));
    const sheet = workbook.getWorksheet(initialDataWorkbookSheetName);
    if (!sheet) throw new Error('TEST_WORKSHEET_NOT_FOUND');
    sheet.getCell('D2').value = { formula: '1+1', result: 2 };
    const file = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(initialDataWorkbookToCsv(file)).rejects.toThrow(
      'IMPORT_XLSX_CELL_INVALID',
    );
  });
});

function asExcelBuffer(file: Buffer) {
  return file as unknown as Parameters<
    InstanceType<typeof ExcelJS.Workbook>['xlsx']['load']
  >[0];
}
