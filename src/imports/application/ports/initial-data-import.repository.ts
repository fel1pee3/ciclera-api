import type { ParsedInitialData } from '../../domain/initial-data-import';

export const INITIAL_DATA_IMPORT_REPOSITORY = Symbol(
  'INITIAL_DATA_IMPORT_REPOSITORY',
);

export interface InitialDataImportResult {
  status: 'IMPORTED' | 'ALREADY_IMPORTED';
  importId: string;
  checksum: string;
  counts: { customers: number; locations: number; equipment: number };
}

export interface InitialDataImportRepository {
  inspect(
    organizationId: string,
    data: ParsedInitialData,
  ): Promise<Map<number, string[]>>;
  commit(input: {
    organizationId: string;
    actorUserId: string;
    requestId: string;
    data: ParsedInitialData;
  }): Promise<
    | InitialDataImportResult
    | { status: 'INVALID'; errors: Map<number, string[]> }
  >;
}
