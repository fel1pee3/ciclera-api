import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  Resend,
  type CreateEmailOptions,
  type CreateEmailResponse,
} from 'resend';
import { readEnvironment } from '../../config/environment';
import type {
  EmailGateway,
  PasswordResetEmail,
} from '../application/ports/email-gateway.port';

@Injectable()
export class LocalPasswordResetEmailGateway implements EmailGateway {
  private readonly isDevelopment: boolean;

  constructor(configService: ConfigService) {
    this.isDevelopment =
      readEnvironment(configService).NODE_ENV === 'development';
  }

  isAvailable(): boolean {
    return true;
  }

  sendPasswordReset(input: PasswordResetEmail): Promise<void> {
    if (this.isDevelopment) {
      const entry = {
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: 'auth.password-reset.local-delivery',
        metadata: {
          recipientDigest: createHash('sha256')
            .update(input.recipientEmail, 'utf8')
            .digest('hex'),
          developmentOnlyLink: input.resetUrl,
        },
      };
      process.stdout.write(`${JSON.stringify(entry)}\n`);
    }

    return Promise.resolve();
  }
}

@Injectable()
export class DisabledPasswordResetEmailGateway implements EmailGateway {
  isAvailable(): boolean {
    return false;
  }

  sendPasswordReset(): Promise<void> {
    return Promise.reject(new Error('Password reset delivery is disabled.'));
  }
}

interface ResendEmailSender {
  send(input: CreateEmailOptions): Promise<CreateEmailResponse>;
}

@Injectable()
export class ResendPasswordResetEmailGateway implements EmailGateway {
  private readonly emailSender: ResendEmailSender;

  constructor(
    apiKey: string,
    private readonly emailFrom: string,
    emailSender?: ResendEmailSender,
  ) {
    this.emailSender = emailSender ?? new Resend(apiKey).emails;
  }

  isAvailable(): boolean {
    return true;
  }

  async sendPasswordReset(input: PasswordResetEmail): Promise<void> {
    const result = await this.emailSender.send({
      from: this.emailFrom,
      to: input.recipientEmail,
      subject: 'Redefina sua senha da Ciclera',
      text: buildPasswordResetText(input.resetUrl),
      html: buildPasswordResetHtml(input.resetUrl),
      tags: [{ name: 'category', value: 'password-reset' }],
    });

    if (result.error) {
      throw new Error('Resend rejected the password reset email.');
    }
  }
}

function buildPasswordResetText(resetUrl: string): string {
  return [
    'Redefinição de senha da Ciclera',
    '',
    'Recebemos uma solicitação para redefinir a senha da sua conta.',
    `Acesse este link para criar uma nova senha: ${resetUrl}`,
    '',
    'Se você não solicitou essa alteração, ignore este e-mail.',
    'Por segurança, o link é temporário e pode ser usado apenas uma vez.',
  ].join('\n');
}

function buildPasswordResetHtml(resetUrl: string): string {
  const safeResetUrl = escapeHtml(resetUrl);

  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#f3f8f6;font-family:Arial,sans-serif;color:#102523">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f3f8f6">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d8e5e1;border-radius:18px;overflow:hidden">
          <tr><td style="padding:28px 32px;background:#073d38;color:#ffffff;font-size:24px;font-weight:700">Ciclera</td></tr>
          <tr><td style="padding:32px">
            <p style="margin:0 0 8px;color:#078873;font-size:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase">Segurança da conta</p>
            <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25">Redefina sua senha</h1>
            <p style="margin:0 0 24px;color:#52635f;font-size:16px;line-height:1.6">Recebemos uma solicitação para criar uma nova senha para sua conta da Ciclera.</p>
            <a href="${safeResetUrl}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#078873;color:#ffffff;text-decoration:none;font-weight:700">Criar nova senha</a>
            <p style="margin:24px 0 0;color:#64736f;font-size:14px;line-height:1.6">Se você não solicitou essa alteração, ignore este e-mail. O link é temporário e pode ser usado apenas uma vez.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
