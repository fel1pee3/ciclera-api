import { buildBillingCsv } from './billing.service';

describe('billing CSV', () => {
  it('keeps cents exact, emits spreadsheet encoding and neutralizes formulas', () => {
    const csv = buildBillingCsv([
      {
        id: 'id',
        number: 9_007_199_254_740_993n,
        title: '=HYPERLINK("bad")',
        serviceType: 'Preventiva',
        customer: { id: 'customer', name: '+SUM(1;1)' },
        customerDocument: '00123456000100',
        actualEndAt: new Date('2026-08-16T12:00:00.000Z'),
        approvedAt: new Date('2026-08-17T12:00:00.000Z'),
        finalAmountInCents: 9_007_199_254_740_993n,
        version: 1,
      },
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"9007199254740993"');
    expect(csv).toContain('"00123456000100"');
    expect(csv).toContain('"\'+SUM(1;1)"');
    expect(csv).toContain('"Preventiva - =HYPERLINK(""bad"")"');
    expect(csv).not.toMatch(/;"=[^\r]/);
  });
});
