import { Injectable } from '@nestjs/common';
import { LinkTokenService } from '../links/link-token.service';
import { DatabaseService, inParams } from '../database/database.service';
import { entityName } from '../helpers/entity.helper';
import { ChannelLogger } from '../logger/channel-logger.service';
import { MailGuardService } from '../mail/mail-guard.service';
import { MailService, type SendMailOptions } from '../mail/mail.service';
import { ViewService } from '../view/view.service';
import { statusMeta } from './approval-status';

export const APPROVAL_TABLE = 'mgr.cb_cash_request_appr';

/** Columns of mgr.cb_cash_request_appr that may be used to identify one approval row. */
const KEY_COLUMNS = ['doc_no', 'entity_cd', 'approve_seq', 'level_no', 'type', 'module', 'request_type', 'trx_type'] as const;
export type ApprovalKey = Partial<Record<(typeof KEY_COLUMNS)[number], unknown>>;

/** Link payload stored behind an approval token (mgr.approval_link). */
export type LinkData = Record<string, any>;

export type ApprovalState = 'processed' | 'missing' | 'pending';

/** Options of views/pages/confirm.eta (all Laravel passcheck*.blade.php variants). */
export interface ConfirmForm {
  /** Form POST path relative to APP_URL, e.g. 'api/cbppu/getaccess'. */
  action: string;
  /** Adds a hidden `module` field (generic /api/getaccess dispatcher). */
  module?: string;
  /**
   * What the approver sees for status A:
   * 'none' (default) nothing, 'comment' an optional "Add Comment" textarea,
   * 'hidden' a hidden reason="no reason" field.
   */
  reasonOnApprove?: 'none' | 'comment' | 'hidden';
  /** false → never show the reason textarea (Laravel passchecknoremark). Default true. */
  showReason?: boolean;
}

/** Result page model (views/pages/result.eta). */
export interface ResultPage {
  Pesan: string;
  St?: string;
  notif?: string;
  image: string;
  entity_name?: string;
}

export type SendOutcome =
  | { kind: 'sent'; email: string }
  | { kind: 'already-sent'; email: string }
  | { kind: 'no-email' }
  | { kind: 'failed'; error: string };

export interface ApprovalMailRequest extends Omit<SendMailOptions, 'to'> {
  /** Recipient (already lower-cased); empty → `no-email`. */
  email: string;
  /** mail_cache sub folder, e.g. 'send_cbppu'. */
  cacheFolder: string;
  /** Marker key parts, usually [approve_seq, entity_cd, doc_no, level_no]. */
  cacheKeys: unknown[];
  /** Label used in log lines, e.g. 'CB PPU'. */
  logLabel: string;
  docNo: unknown;
  entityCd: unknown;
}

/**
 * Shared approval workflow used by every module:
 *  1. ERP calls POST /api/<module> → render + send the approval email once (mail guard).
 *  2. Approver opens GET /api/<module>/<A|R|C>/<token> → confirmation page (if still pending).
 *  3. Confirmation form POSTs /api/<module>/getaccess → module stored procedure → result page.
 */
@Injectable()
export class ApprovalService {
  constructor(
    readonly db: DatabaseService,
    /** Approval-link tokens: links.issue(payload) → token, links.resolve(token) → payload. */
    readonly links: LinkTokenService,
    readonly views: ViewService,
    readonly mail: MailService,
    readonly guard: MailGuardService,
    readonly log: ChannelLogger,
  ) {}

  // ---------------------------------------------------------------- step 1: send email

  async sendApprovalMail(req: ApprovalMailRequest): Promise<SendOutcome> {
    const { email, cacheFolder, cacheKeys, logLabel, docNo, entityCd, ...mail } = req;
    if (!email) {
      this.log.warning('sendmail', `No email address provided for document ${docNo}`);
      return { kind: 'no-email' };
    }
    try {
      const marker = this.guard.markerPath(cacheFolder, cacheKeys);
      const result = await this.guard.once(marker, () => this.mail.send({ ...mail, to: email }));
      if (result === 'sent') {
        this.log.info('sendmailapproval', `Email ${logLabel} doc_no ${docNo} Entity ${entityCd} berhasil dikirim ke: ${email}`);
        return { kind: 'sent', email };
      }
      this.log.info('sendmailapproval', `Email ${logLabel} doc_no ${docNo} Entity ${entityCd} already sent to: ${email}`);
      return { kind: 'already-sent', email };
    } catch (err) {
      const error = (err as Error).message;
      this.log.error('sendmail', `Gagal mengirim email: ${error}`);
      return { kind: 'failed', error };
    }
  }

  /** Plain-text response used by CB / CM / PO / PL endpoints. */
  outcomeText(outcome: SendOutcome): string {
    switch (outcome.kind) {
      case 'sent':
        return `Email berhasil dikirim ke: ${outcome.email}`;
      case 'already-sent':
        return `Email has already been sent to: ${outcome.email}`;
      case 'no-email':
        return 'No email address provided';
      case 'failed':
        return `Gagal mengirim email: ${outcome.error}`;
    }
  }

  /** JSON callback used by the Land endpoints: { data, Error, Pesan, Status } with matching HTTP status. */
  outcomeCallback(outcome: SendOutcome, data: unknown) {
    const map = {
      sent: { Error: false, Status: 200, Pesan: `Email berhasil dikirim ke: ${'email' in outcome ? outcome.email : ''}` },
      'already-sent': { Error: false, Status: 201, Pesan: `Email sudah pernah dikirim ke: ${'email' in outcome ? outcome.email : ''}` },
      'no-email': { Error: true, Status: 400, Pesan: 'No email address provided' },
      failed: { Error: true, Status: 500, Pesan: `Gagal mengirim email: ${'error' in outcome ? outcome.error : ''}` },
    } as const;
    return { data, ...map[outcome.kind] };
  }

  // ---------------------------------------------------------------- step 2: confirmation page

  /** processed = already A/R/C, missing = no pending row, pending = can be actioned. */
  async state(key: ApprovalKey): Promise<ApprovalState> {
    const { where, params } = buildWhere(key);
    const done = inParams('st', ['A', 'R', 'C']);
    const processed = await this.db.exists(
      `SELECT 1 FROM ${APPROVAL_TABLE} WHERE ${where} AND status IN (${done.sql})`,
      { ...params, ...done.params },
    );
    if (processed) return 'processed';
    const pending = await this.db.exists(
      `SELECT 1 FROM ${APPROVAL_TABLE} WHERE ${where} AND status = 'P'`,
      params,
    );
    return pending ? 'pending' : 'missing';
  }

  /**
   * GET /<module>/<status>/<token>: resolves the link token, checks the approval row and renders
   * either the "restricted" result page or the confirmation form.
   */
  async confirmationPage(opts: {
    status: string;
    encrypt: string;
    /** Columns of the decrypted payload used to locate the row (default: no approve_seq). */
    keyFields?: (keyof ApprovalKey)[];
    /** Explicit row key built from the payload; overrides keyFields. */
    key?: (data: LinkData) => ApprovalKey;
    /** Document label in the restricted messages (default: the encrypted `text`). */
    label?: string;
    /** Wording of the "already processed" message (capitalisation differs between PHP controllers). */
    alreadyPrefix?: string;
    /** Form options, or a function of the decrypted payload returning them. */
    form: ConfirmForm | ((data: LinkData) => ConfirmForm);
  }): Promise<string> {
    const data = await this.links.resolve<LinkData>(opts.encrypt);
    this.log.info('app', `Decrypted data: ${JSON.stringify(data)}`);
    const fields = opts.keyFields ?? ['doc_no', 'entity_cd', 'level_no', 'type', 'module'];
    const key: ApprovalKey =
      opts.key?.(data) ??
      Object.fromEntries(fields.map((f) => [f, f === 'module' ? data.type_module : data[f]]));

    const state = await this.state(key);
    if (state !== 'pending') {
      const label = opts.label ?? data.text;
      const prefix = opts.alreadyPrefix ?? 'You Have Already Made a Request to';
      return this.resultPage({
        Pesan:
          state === 'processed'
            ? `${prefix} ${label} No. ${data.doc_no}`
            : `There is no ${label} with No. ${data.doc_no}`,
        St: 'OK',
        notif: 'Restricted !',
        image: 'double_approve.png',
        entity_name: data.entity_name,
      });
    }

    const form = typeof opts.form === 'function' ? opts.form(data) : opts.form;
    return this.views.render('pages/confirm', {
      reasonOnApprove: 'none',
      showReason: true,
      ...form,
      ...statusMeta(opts.status),
      status: opts.status,
      doc_no: data.doc_no,
      email: data.email_address,
      entity_name: entityName(data.entity_name),
      encrypt: opts.encrypt,
    });
  }

  // ---------------------------------------------------------------- step 3: action result

  /**
   * Runs the module stored procedure and renders the result page.
   * @param text document label, e.g. "Payment Request".
   */
  async runAction(opts: {
    status: string;
    docNo: unknown;
    text: string;
    procedure: string;
    args: unknown[];
    entityName?: unknown;
  }): Promise<string> {
    const meta = statusMeta(opts.status);
    let page: ResultPage;
    try {
      await this.db.exec(opts.procedure, opts.args);
      page = {
        Pesan: `You Have Successfully ${meta.past} the ${opts.text} No. ${opts.docNo}`,
        St: 'OK',
        notif: `${meta.past} !`,
        image: meta.image,
      };
    } catch (err) {
      this.log.error('app', `${opts.procedure} failed for ${opts.docNo}: ${(err as Error).message}`);
      page = {
        Pesan: `You Failed to ${meta.past} the ${opts.text} No. ${opts.docNo}`,
        St: 'FAIL',
        notif: `Fail to ${meta.past} !`,
        image: 'reject.png',
      };
    }
    return this.views.render('pages/result', {
      ...page,
      entity_name: entityName(opts.entityName),
    });
  }

  /** Project description (mgr.pl_project.descs) — shown as the header name on CB result pages. */
  async projectDescs(entityCd: unknown, projectNo: unknown): Promise<string | undefined> {
    return this.db.value<string>(
      'SELECT descs FROM mgr.pl_project WHERE entity_cd = @entity_cd AND project_no = @project_no',
      { entity_cd: entityCd, project_no: projectNo },
    );
  }

  /** Render an arbitrary result page (errors, restricted, etc.). */
  resultPage(page: ResultPage): string {
    return this.views.render('pages/result', { ...page, entity_name: entityName(page.entity_name) });
  }
}

function buildWhere(key: ApprovalKey) {
  const entries = Object.entries(key).filter(([col]) => (KEY_COLUMNS as readonly string[]).includes(col));
  if (!entries.length) throw new Error('Approval key must contain at least one column');
  return {
    where: entries.map(([col]) => `${col} = @k_${col}`).join(' AND '),
    params: Object.fromEntries(entries.map(([col, v]) => [`k_${col}`, v])),
  };
}
