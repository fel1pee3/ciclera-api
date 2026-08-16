import { StructuredPasswordResetDeliveryObserver } from './password-reset-delivery-observer';

describe('StructuredPasswordResetDeliveryObserver', () => {
  it('records a fixed structured event without identity or token data', () => {
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const observer = new StructuredPasswordResetDeliveryObserver();

    observer.recordFailure('delivery');

    expect(stderr.mock.calls).toHaveLength(1);
    const output = String(stderr.mock.calls[0]?.[0]);
    expect(output).toContain('auth.password-reset.delivery-failed');
    expect(output).toContain('delivery');
    expect(output).not.toMatch(/email|recipient|url|tokenHash/i);
    stderr.mockRestore();
  });
});
