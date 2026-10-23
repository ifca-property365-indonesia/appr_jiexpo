import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../../config/env';
import { elapsedMs, TransactionLog } from '../logger/transaction-log.service';
import { ViewService } from '../view/view.service';

export interface SendMailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  /** Template path under views/, e.g. 'email/cbppu/send'. */
  template: string;
  context?: object;
  /**
   * Appended to MAIL_FROM_NAME as "IFCA SOFTWARE - <entity>" (Laravel Mailable behaviour).
   * Omit to send with the plain MAIL_FROM_NAME.
   */
  entityName?: string;
}

@Injectable()
export class MailService implements OnApplicationShutdown {
  private readonly transporter: Transporter;
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly views: ViewService,
    private readonly tx: TransactionLog,
  ) {
    const encryption = config.get('MAIL_ENCRYPTION', { infer: true });
    const user = config.get('MAIL_USERNAME', { infer: true });
    this.transporter = createTransport({
      host: config.get('MAIL_HOST', { infer: true }),
      port: config.get('MAIL_PORT', { infer: true }),
      secure: encryption === 'ssl',
      requireTLS: encryption === 'tls',
      auth: user ? { user, pass: config.get('MAIL_PASSWORD', { infer: true }) } : undefined,
      pool: true,
      maxConnections: 5,
    });
    this.fromAddress = config.get('MAIL_FROM_ADDRESS', { infer: true });
    this.fromName = config.get('MAIL_FROM_NAME', { infer: true });
  }

  async send(options: SendMailOptions): Promise<void> {
    const name = options.entityName ? `${this.fromName} - ${options.entityName}` : this.fromName;
    const recipients = {
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      template: options.template,
    };
    const started = process.hrtime.bigint();
    try {
      const info = await this.transporter.sendMail({
        from: { name, address: this.fromAddress },
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        subject: options.subject,
        html: this.views.render(options.template, options.context),
      });
      this.tx.info('mail.sent', {
        ...recipients,
        message_id: info.messageId,
        duration_ms: elapsedMs(started),
      });
    } catch (err) {
      this.tx.error('mail.failed', { ...recipients, duration_ms: elapsedMs(started), error: err });
      throw err;
    }
  }

  onApplicationShutdown(): void {
    this.transporter.close();
  }
}
