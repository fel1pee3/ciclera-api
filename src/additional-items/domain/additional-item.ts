export const additionalItemTypes = [
  'MATERIAL',
  'SERVICE',
  'ADDITIONAL_HOUR',
] as const;
export type AdditionalItemType = (typeof additionalItemTypes)[number];

export function parseQuantity(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/.test(value)) {
    throw new Error('INVALID_ADDITIONAL_ITEM');
  }
  const [whole, fraction = ''] = value.split('.');
  const result = BigInt(whole) * 1_000n + BigInt(fraction.padEnd(3, '0'));
  if (result <= 0n) throw new Error('INVALID_ADDITIONAL_ITEM');
  return result;
}

export function formatQuantity(value: bigint): string {
  const whole = value / 1_000n;
  const fraction = (value % 1_000n)
    .toString()
    .padStart(3, '0')
    .replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function parseUnitAmount(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,15})$/.test(value)) {
    throw new Error('INVALID_ADDITIONAL_ITEM');
  }
  return BigInt(value);
}

export function calculateTotal(
  quantityInThousand: bigint,
  unitAmountInCents: bigint,
): bigint {
  return (quantityInThousand * unitAmountInCents + 500n) / 1_000n;
}
