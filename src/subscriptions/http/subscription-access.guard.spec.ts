import { isAllowedFieldCompletionWrite } from './subscription-access.guard';

describe('limited subscription field writes', () => {
  const order = '11111111-1111-4111-8111-111111111111';
  const evidence = '22222222-2222-4222-8222-222222222222';

  it.each([
    ['PATCH', `/api/v1/field/work-orders/${order}/execution`],
    ['POST', `/api/v1/field/work-orders/${order}/submit-for-review`],
    ['POST', `/api/v1/field/work-orders/${order}/resume-correction`],
    ['POST', `/api/v1/field/work-orders/${order}/execution/additional-items`],
    [
      'DELETE',
      `/api/v1/field/work-orders/${order}/execution/additional-items/${evidence}`,
    ],
    ['POST', `/api/v1/field/work-orders/${order}/execution/evidence/intents`],
    ['PUT', `/api/v1/field/evidence/${evidence}/upload`],
    [
      'POST',
      `/api/v1/field/work-orders/${order}/execution/evidence/${evidence}/confirm`,
    ],
  ])('allows %s %s to finish ongoing field work', (method, path) => {
    expect(isAllowedFieldCompletionWrite(method, path)).toBe(true);
  });

  it.each([
    ['POST', `/api/v1/field/work-orders/${order}/start`],
    ['POST', '/api/v1/work-orders'],
    ['PATCH', '/api/v1/customers/11111111-1111-4111-8111-111111111111'],
  ])('blocks %s %s from starting or changing other work', (method, path) => {
    expect(isAllowedFieldCompletionWrite(method, path)).toBe(false);
  });
});
