import {
  calculateTotal,
  formatQuantity,
  parseQuantity,
  parseUnitAmount,
} from './additional-item';

describe('additional item precision', () => {
  it('uses thousandths for quantity and half-up rounding to cents', () => {
    expect(parseQuantity('1.5')).toBe(1_500n);
    expect(formatQuantity(1_500n)).toBe('1.5');
    expect(calculateTotal(333n, 100n)).toBe(33n);
    expect(calculateTotal(335n, 100n)).toBe(34n);
  });

  it('rejects zero, negative and excess precision without floats', () => {
    expect(() => parseQuantity('0')).toThrow();
    expect(() => parseQuantity('-1')).toThrow();
    expect(() => parseQuantity('1.0001')).toThrow();
    expect(parseUnitAmount('9999999999999999')).toBe(9_999_999_999_999_999n);
    expect(() => parseUnitAmount('1.5')).toThrow();
  });
});
