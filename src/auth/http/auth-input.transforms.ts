import type { TransformFnParams } from 'class-transformer';
import { normalizeEmail } from '../application/auth.service';

export function normalizeEmailInput(input: TransformFnParams): unknown {
  const value: unknown = input.value;
  return typeof value === 'string' ? normalizeEmail(value) : value;
}
