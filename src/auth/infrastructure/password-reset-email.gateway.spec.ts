import type { CreateEmailOptions, CreateEmailResponse } from 'resend';
import { ResendPasswordResetEmailGateway } from './password-reset-email.gateway';

describe('ResendPasswordResetEmailGateway', () => {
  const input = {
    recipientEmail: 'user@example.test',
    resetUrl: 'https://ciclera.example/redefinir-senha#token=test-token-value',
  };

  it('sends branded HTML and plain text without changing the reset URL', async () => {
    const send = jest
      .fn<Promise<CreateEmailResponse>, [CreateEmailOptions]>()
      .mockResolvedValue({
        data: { id: 'email-id' },
        error: null,
        headers: null,
      });
    const gateway = new ResendPasswordResetEmailGateway(
      're_test_only_key',
      'Ciclera <nao-responda@mail.ciclera.example>',
      { send },
    );

    await expect(gateway.sendPasswordReset(input)).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      from: 'Ciclera <nao-responda@mail.ciclera.example>',
      to: input.recipientEmail,
      subject: 'Redefina sua senha da Ciclera',
      tags: [{ name: 'category', value: 'password-reset' }],
    });
    expect(send.mock.calls[0]?.[0].text).toContain(input.resetUrl);
    expect(send.mock.calls[0]?.[0].html).toContain(input.resetUrl);
  });

  it('converts a provider rejection into a delivery failure', async () => {
    const send = jest
      .fn<Promise<CreateEmailResponse>, [CreateEmailOptions]>()
      .mockResolvedValue({
        data: null,
        error: {
          message: 'provider detail that must remain internal',
          name: 'validation_error',
          statusCode: 422,
        },
        headers: null,
      });
    const gateway = new ResendPasswordResetEmailGateway(
      're_test_only_key',
      'Ciclera <nao-responda@mail.ciclera.example>',
      { send },
    );

    await expect(gateway.sendPasswordReset(input)).rejects.toThrow(
      'Resend rejected the password reset email.',
    );
  });
});
