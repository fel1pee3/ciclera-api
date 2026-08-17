export function displayText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizedText(value: string): string {
  return displayText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function normalizedDocument(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return normalized || null;
}

export function digitsOnly(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.replace(/\D/g, '');
  return normalized || null;
}

export function optionalText(value: string | null | undefined) {
  if (value === null || value === undefined) return null;
  const normalized = displayText(value);
  return normalized || null;
}
