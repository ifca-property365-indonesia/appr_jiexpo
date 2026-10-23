import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import {
  approverList,
  emailInput,
  entityName,
  explode,
  input,
  now,
  numberFormat,
  pairAttachments,
  type Attachment,
  type RequestInput,
} from '../../common/helpers';
import { ChannelLogger } from '../../common/logger/channel-logger.service';
import { MailGuardService, type GuardResult } from '../../common/mail/mail-guard.service';
import { MailService, type SendMailOptions } from '../../common/mail/mail.service';
import { ftpSize, FtpConnectError } from './ftp-size';

dayjs.extend(customParseFormat);

const TEMPLATE = 'email/staff/staffaction';
const LAND_REQUEST_TEMPLATE = 'email/staff/land-request-next';
const FEEDBACK_PREFIX = 'email_feedback_sent';
const PRODUCT_LIST_INTRO =
  'To view a detailed product list, description, and estimate price per item, please click on the link below :';
const NO_FEEDBACK_EMAIL = 'Tidak ada alamat email untuk feedback yang diberikan';
const FAILED_GENERIC = 'Gagal mengirim email. Cek log untuk detailnya.';

/** Laravel FileExist FTP target (hard-coded in PHP; overridable via env without touching src/config). */
const FTP = {
  host: process.env.FILEEXIST_FTP_HOST || 'uat.ifca.co.id',
  port: Number(process.env.FILEEXIST_FTP_PORT || 2111),
  user: process.env.FILEEXIST_FTP_USER || 'jiexpo',
  password: process.env.FILEEXIST_FTP_PASSWORD || 'jiexpo',
};

/**
 * Single-recipient staff feedback emails (StaffActionController + StaffFeedbackController).
 * They only differ by template blocks, cache folder, folder date and reply texts.
 */
export interface StaffVariant {
  /** Log / debug label (Laravel Mailable). */
  name: string;
  cacheFolder: string;
  /** url_file / file_name ('; ' lists) attachment block. */
  attachments: boolean;
  /** Request field holding '; '-separated "Additional Document Link" URLs. */
  docLinkField?: 'doc_link' | 'document_link';
  /** 'approved_date' = strict SQL Server date ('M  j Y h:iA') of the request; failure → error reply. */
  folderDate: 'today' | 'approved_date';
  /** 'silent' = PHP returned null (empty body) when already sent; 'reply' = "Email Sudah dikirim ke: …". */
  alreadySent: 'silent' | 'reply';
  /** 'detail' = "Gagal mengirim email: <error>", 'generic' = "… Cek log untuk detailnya." */
  failed: 'detail' | 'generic';
}

/** POST /api/staffaction — StaffActionMail (email/staffaction.blade.php). */
export const STAFF_ACTION: StaffVariant = {
  name: 'StaffActionMail',
  cacheFolder: 'feedbackStaffAction',
  attachments: false,
  folderDate: 'today',
  alreadySent: 'silent',
  failed: 'detail',
};

/** POST /api/staffaction_pos — StaffActionPoSMail (email/staffaction/pos.blade.php). */
export const STAFF_ACTION_POS: StaffVariant = {
  name: 'StaffActionPoSMail',
  cacheFolder: 'feedbackPOS',
  attachments: true,
  folderDate: 'today',
  alreadySent: 'silent',
  failed: 'generic',
};

/** POST /api/feedback_po — StaffActionPoOrderMail (email/staffaction/poorder.blade.php). */
export const FEEDBACK_PO: StaffVariant = {
  name: 'StaffActionPoOrderMail',
  cacheFolder: 'feedbackPoOrder',
  attachments: true,
  docLinkField: 'document_link',
  folderDate: 'today',
  alreadySent: 'reply',
  failed: 'generic',
};

/** POST /api/feedback_cb_fupd — StaffActionCbFupdMail (email/staffaction/cbfupd.blade.php). */
export const FEEDBACK_CB_FUPD: StaffVariant = {
  name: 'StaffActionCbFupdMail',
  cacheFolder: 'feedbackCbFupd',
  attachments: true,
  folderDate: 'today',
  alreadySent: 'reply',
  failed: 'generic',
};

/** POST /api/feedback_cb — StaffActionCbMail (email/staffaction/cb.blade.php). */
export const FEEDBACK_CB: StaffVariant = {
  name: 'StaffActionCbMail',
  cacheFolder: 'feedbackCb',
  attachments: true,
  folderDate: 'approved_date',
  alreadySent: 'reply',
  failed: 'generic',
};

/** POST /api/feedback_cm_progress — also StaffActionCbMail. */
export const FEEDBACK_CM_PROGRESS: StaffVariant = {
  ...FEEDBACK_CB,
  cacheFolder: 'feedback_cm_progress_wu',
};

export interface JsonReply {
  status: number;
  body: Record<string, unknown>;
}

/** strcasecmp-based action + body text shared by every staff feedback email. */
export function feedbackText(
  status: unknown,
  descs: string,
  ref: string,
  reason: string,
  approvedSuffix = '',
): { action: string; bodyEMail: string } {
  switch (String(status ?? '').toUpperCase()) {
    case 'R':
      return { action: 'Revision', bodyEMail: `Please revise ${descs}${ref} with the reason : ${reason}` };
    case 'C':
      return { action: 'Cancellation', bodyEMail: `${descs}${ref} has been cancelled with the reason : ${reason}` };
    case 'A':
      return { action: 'Approval', bodyEMail: `Your Request ${descs}${ref} has been Approved${approvedSuffix}` };
    default:
      return { action: '', bodyEMail: '' };
  }
}

/** Carbon::createFromFormat('M  j Y h:iA', v)->format('Ymd'); null when it does not match. */
function sqlServerStamp(value: unknown): string | null {
  const s = String(value ?? '').trim().replace(/\s+/g, ' ');
  const d = dayjs(s, 'MMM D YYYY h:mmA', true);
  return d.isValid() ? d.format('YYYYMMDD') : null;
}

/** POR fallback chain: SQL Server text → 'Y-m-d H:i:s' → today. */
function lenientStamp(value: unknown): string {
  const strict = sqlServerStamp(value);
  if (strict) return strict;
  const iso = dayjs(String(value ?? '').trim(), 'YYYY-MM-DD HH:mm:ss', true);
  return iso.isValid() ? iso.format('YYYYMMDD') : now('YYYYMMDD');
}

const str = (body: RequestInput, key: string) => input(body, key) ?? '';
const list = (value: unknown) => explode(value, '; ');

@Injectable()
export class StaffService {
  constructor(
    private readonly mail: MailService,
    private readonly guard: MailGuardService,
    private readonly log: ChannelLogger,
  ) {}

  // ------------------------------------------------------------------ single-recipient variants

  async staffAction(variant: StaffVariant, body: RequestInput): Promise<string> {
    const docNo = str(body, 'doc_no');
    const entityCd = str(body, 'entity_cd');
    const email = emailInput(body);
    const failed = (err: unknown) => {
      const msg = (err as Error).message;
      this.log.error('sendmail', `Gagal mengirim email: ${msg}`);
      return variant.failed === 'detail' ? `Gagal mengirim email: ${msg}` : FAILED_GENERIC;
    };

    let folderDate: string | undefined;
    if (variant.folderDate === 'approved_date') {
      folderDate = sqlServerStamp(body.approved_date) ?? undefined;
      if (!folderDate) return failed(new Error(`Invalid approved_date: ${str(body, 'approved_date')}`));
    }

    if (!email) {
      this.log.warning('sendmail', NO_FEEDBACK_EMAIL);
      this.log.warning('sendmail', docNo);
      return NO_FEEDBACK_EMAIL;
    }

    const { bodyEMail } = feedbackText(body.status, str(body, 'descs'), ` No. ${docNo}`, str(body, 'reason'));
    try {
      const marker = this.guard.markerPath(
        variant.cacheFolder,
        [body.approve_seq, body.entity_cd, body.doc_no, body.status],
        FEEDBACK_PREFIX,
        folderDate,
      );
      const result = await this.sendOnce(marker, {
        to: email,
        subject: `${str(body, 'subject')} ${str(body, 'descs')} No. ${docNo}`,
        template: TEMPLATE,
        context: this.context(body, bodyEMail, {
          attachments: variant.attachments ? this.listAttachments(body) : [],
          doc_links: variant.docLinkField ? list(body[variant.docLinkField]) : [],
        }),
      });

      if (result === 'sent') {
        this.log.info('sendmailfeedback', `Email Feedback doc_no ${docNo} Entity ${entityCd} berhasil dikirim ke: ${email}`);
        return `Email berhasil dikirim ke: ${email}`;
      }
      if (variant.alreadySent === 'silent') return '';
      this.log.info('sendmailfeedback', `Email Feedback doc_no ${docNo} Entity ${entityCd} sudah dikirim ke: ${email}`);
      return `Email Sudah dikirim ke: ${email}`;
    } catch (err) {
      return failed(err);
    }
  }

  // ------------------------------------------------------------------ POST /api/staffaction_por

  /** StaffActionPoRMail: several recipients, CC on approval, folder dated by date_approved. */
  async staffActionPor(body: RequestInput): Promise<string> {
    const docNo = str(body, 'doc_no');
    const entityCd = str(body, 'entity_cd');
    const status = str(body, 'status');
    const reason = str(body, 'reason');
    const { action, bodyEMail } = feedbackText(status, str(body, 'descs'), ` No. ${docNo}`, reason, ` with the Note : ${reason}`);

    try {
      const folderDate = lenientStamp(body.date_approved);
      const emails = emailInput(body).split(';').map((e) => e.trim()).filter(Boolean);
      if (!emails.length) {
        this.log.warning('sendmail', 'Tidak ada alamat email yang diberikan.');
        return 'Tidak ada alamat email yang diberikan.';
      }

      let cc: string[] = [];
      const emailCc = str(body, 'email_cc');
      if (status.toUpperCase() === 'A' && emailCc) {
        cc = [...new Set(emailCc.split(';').map((e) => e.trim()))].filter((e) => e && !emails.includes(e));
      }

      const marker = this.guard.markerPath(
        'feedbackPOR',
        [body.approve_seq, body.entity_cd, body.doc_no, body.status],
        FEEDBACK_PREFIX,
        folderDate,
      );
      const result = await this.sendOnce(marker, {
        to: emails,
        cc: cc.length ? cc : undefined,
        subject: `${str(body, 'subject')} ${str(body, 'descs')} No. ${docNo}`,
        template: TEMPLATE,
        context: this.context(body, bodyEMail, {
          attachments: this.listAttachments(body),
          doc_links: list(body.doc_link),
        }),
      });
      if (result !== 'sent') return 'Email sudah dikirim sebelumnya.';

      const sentTo = emails.join(', ');
      const ccText = cc.length ? ` & CC ke : ${cc.join(', ')}` : '';
      this.log.info('sendmailfeedback', `Email Feedback ${action} doc_no ${docNo} Entity ${entityCd} berhasil dikirim ke: ${sentTo}${ccText}`);
      return `Email berhasil dikirim ke: ${sentTo}${ccText}`;
    } catch (err) {
      this.log.error('sendmail', `Gagal mengirim email: ${(err as Error).message}`);
      return FAILED_GENERIC;
    }
  }

  // ------------------------------------------------------------------ POST /api/feedbackland

  /** FeedbackMail (email/additional/staffaction.blade.php) for the Land modules. JSON callback. */
  async feedbackLand(body: RequestInput): Promise<JsonReply> {
    const docNo = str(body, 'doc_no');
    const entityCd = str(body, 'entity_cd');
    const descsSend = str(body, 'descs_send');
    const { action, bodyEMail } = feedbackText(body.status, str(body, 'descs'), '', str(body, 'reason'), ' ');
    const reply = (Error: boolean, Pesan: string, Status: number): JsonReply => ({
      status: Status,
      body: { Error, Pesan, Status },
    });

    try {
      const emails = emailInput(body).split(';').map((e) => e.trim()).filter(Boolean);
      if (!emails.length) {
        this.log.warning('sendmail', 'Tidak ada alamat email yang diberikan.');
        return reply(true, 'Tidak ada alamat email yang diberikan.', 400);
      }
      // descs_send becomes a cache sub-folder: refuse anything that could escape mail_cache/feedback.
      if (!/^[\w-]*$/.test(descsSend)) throw new Error(`Invalid descs_send: ${descsSend}`);

      const marker = this.guard.markerPath(
        `feedback/${descsSend}`,
        [body.approve_seq, body.entity_cd, body.doc_no, body.status],
        FEEDBACK_PREFIX,
      );
      const result = await this.sendOnce(marker, {
        to: emails,
        subject: `${str(body, 'subject')} ${str(body, 'descs')}`,
        template: TEMPLATE,
        context: this.context(body, bodyEMail, {
          attachments: pairAttachments(body.url_link, body.file_name),
          attachment_intro: 'To view detail transaction, please click the link below:',
        }),
      });
      if (result !== 'sent') return reply(false, 'Email sudah dikirim sebelumnya.', 200);

      this.log.info(
        'sendmailfeedback',
        `Email Feedback ${action} doc_no ${docNo} Entity ${entityCd} berhasil dikirim ke: ${emails.join(', ')}`,
      );
      return reply(false, 'Email berhasil dikirim.', 200);
    } catch (err) {
      this.log.error('sendmail', `Gagal mengirim email: ${(err as Error).message}`);
      return reply(true, 'Gagal mengirim email. Cek log untuk detailnya.', 500);
    }
  }

  // ------------------------------------------------------------------ POST /api/feedbacklandrequest

  /** SendNextLandReqeuest (email/landrequestmail/terusan.blade.php): forward to finance, one email per address. */
  async feedbackLandRequest(body: RequestInput): Promise<JsonReply> {
    let callback: Record<string, unknown> = { Error: false, Pesan: '', Status: 200 };
    const docNo = str(body, 'doc_no');
    const entityCd = str(body, 'entity_cd');

    try {
      const paymentCd = str(body, 'payment_cd');
      const paymentText: Record<string, string> = {
        A: 'Tolong proses AP Advance dengan detail :',
        I: 'Tolong proses AP Invoice dengan detail :',
      };
      const paymentSubject: Record<string, string> = {
        A: `Land Transaction AP Advance No. ${docNo}`,
        I: `Land Transaction AP Invoice No. ${docNo}`,
      };
      const detailText = paymentText[paymentCd] ?? 'Tolong proses Pengajuan Pembayaran dengan detail :';
      const subject = paymentSubject[paymentCd] ?? `Land Transaction No. ${docNo}`;

      const payload = {
        user_id: input(body, 'user_id'),
        level_no: input(body, 'level_no'),
        entity_cd: input(body, 'entity_cd'),
        doc_no: input(body, 'doc_no'),
        approve_seq: input(body, 'approve_seq'),
        email_addr: input(body, 'email_addr'),
        user_name: input(body, 'user_name'),
        sender_addr: input(body, 'sender_addr'),
        sender_name: input(body, 'sender_name'),
        entity_name: entityName(body.entity_name),
        attachments: pairAttachments(body.url_link, body.file_name),
        descs: input(body, 'descs'),
        approve_list: approverList(body.approve_exist),
        type: explode(body.type, ';'),
        name_owner: explode(body.name_owner, ';'),
        nop_no: explode(body.nop_no, ';'),
        sph_trx_no: explode(body.sph_trx_no, ';'),
        request_amt: explode(body.request_amt, ';').map((v) => numberFormat(v)),
        clarify_user: input(body, 'sender_name'),
        clarify_email: input(body, 'sender_addr'),
        detail_text: detailText,
        subject,
        link: 'landrequest',
      };
      callback.data = { payload };

      const emails = emailInput(body).split(';').map((e) => e.trim()).filter(Boolean);
      if (!emails.length) {
        this.log.warning('sendmail', `No email address provided for document ${docNo}`);
        callback = { Pesan: 'No email address provided', Error: true, Status: 400 };
      }

      for (const email of emails) {
        const marker = this.guard.markerPath('email_terusan/send_Land_Request', [
          body.approve_seq,
          body.entity_cd,
          body.doc_no,
          body.level_no,
          createHash('md5').update(email).digest('hex'),
        ]);
        const result = await this.sendOnce(marker, {
          to: email,
          subject,
          template: LAND_REQUEST_TEMPLATE,
          context: payload,
        });
        if (result === 'sent') {
          this.log.info('sendmailapproval', `Email Terusan Land Request doc_no ${docNo} Entity ${entityCd} berhasil dikirim ke: ${email}`);
          Object.assign(callback, { Pesan: `Email berhasil dikirim ke: ${email}`, Error: false, Status: 200 });
        } else {
          this.log.info('sendmailapproval', `Email Terusan Land Request doc_no ${docNo} Entity ${entityCd} sudah pernah dikirim ke: ${email}`);
          Object.assign(callback, { Pesan: `Email sudah pernah dikirim ke: ${email}`, Error: true, Status: 400 });
        }
      }
    } catch (err) {
      const msg = (err as Error).message;
      this.log.error('sendmail', `Gagal mengirim email: ${msg}`);
      Object.assign(callback, { Pesan: `Gagal mengirim email: ${msg}`, Error: true, Status: 500 });
    }
    return { status: Number(callback.Status), body: callback };
  }

  // ------------------------------------------------------------------ POST /api/fileexist

  /** Checks ifca-att/<folder_name>/<file_name> on the attachment FTP server. */
  async fileExist(body: RequestInput): Promise<string> {
    const path = `ifca-att/${str(body, 'folder_name')}/${str(body, 'file_name')}`;
    try {
      return (await ftpSize(FTP, path)) > 0 ? 'Ada File' : 'Tidak Ada File';
    } catch (err) {
      if (err instanceof FtpConnectError) return `Could not connect to ${FTP.host}`;
      this.log.error('app', `fileexist ${path}: ${(err as Error).message}`);
      return 'Tidak Ada File';
    }
  }

  // ------------------------------------------------------------------ helpers

  private sendOnce(marker: string, options: SendMailOptions): Promise<GuardResult> {
    return this.guard.once(marker, () => this.mail.send(options));
  }

  /** url_file / file_name '; ' lists paired by position (the template skips blank / EMPTY pairs). */
  private listAttachments(body: RequestInput): Attachment[] {
    const files = list(body.file_name);
    return list(body.url_file).map((url, i) => ({ url, file_name: files[i] ?? '' }));
  }

  private context(body: RequestInput, bodyEMail: string, extra: object) {
    return {
      entity_name: entityName(body.entity_name),
      user_name: str(body, 'user_name'),
      bodyEMail,
      staff_act_send: str(body, 'staff_act_send'),
      attachments: [] as Attachment[],
      doc_links: [] as string[],
      attachment_intro: PRODUCT_LIST_INTRO,
      ...extra,
    };
  }
}
