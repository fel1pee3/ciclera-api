import {
  importHeaders,
  initialDataTemplate,
  parseInitialDataCsv,
} from './initial-data-import';

describe('initial data CSV', () => {
  it('parses the official hierarchy and quoted semicolons', () => {
    const content = [
      importHeaders.join(';'),
      'CLIENT;c1;;"Cliente; Norte";12345678900;;;;;;;;;;;;',
      'LOCATION;l1;c1;Matriz;;01000-000;Rua A;10;;Centro;São Paulo;SP;;;;;',
      'EQUIPMENT;e1;l1;Condensadora;;;;;;;;;EQ-1;Climatização;Marca;Modelo;SER-1',
    ].join('\r\n');
    const result = parseInitialDataCsv(content);

    expect(result.rows.every((row) => row.errors.length === 0)).toBe(true);
    expect(result.customers[0]?.name).toBe('Cliente; Norte');
    expect(result.locations[0]?.parentExternalKey).toBe('c1');
    expect(result.equipment[0]?.parentExternalKey).toBe('l1');
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects missing relationships and duplicate business identities', () => {
    const content = [
      importHeaders.join(';'),
      'CLIENT;c1;;Cliente Igual;;;;;;;;;;;;;',
      'CLIENT;c2;;Cliente Igual;;;;;;;;;;;;;',
      'LOCATION;l1;missing;Filial;;01000-000;Rua A;10;;Centro;São Paulo;SP;;;;;',
      'EQUIPMENT;e1;missing;Máquina;;;;;;;;;EQ-1;Industrial;;;;',
    ].join('\n');
    const result = parseInitialDataCsv(content);

    expect(result.rows.find((row) => row.line === 3)?.errors).toContain(
      'Cliente duplicado por nome no arquivo. Primeira ocorrência: linha 2.',
    );
    expect(result.rows.find((row) => row.line === 4)?.errors).toContain(
      'Cliente pai não encontrado no arquivo.',
    );
    expect(result.rows.find((row) => row.line === 5)?.errors).toContain(
      'Local pai não encontrado no arquivo.',
    );
  });

  it('keeps the official template within the accepted contract', () => {
    expect(() => parseInitialDataCsv(initialDataTemplate)).not.toThrow();
    expect(Buffer.byteLength(initialDataTemplate, 'utf8')).toBeLessThan(90_000);
  });
});
