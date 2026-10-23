import { Injectable } from '@nestjs/common';
import { ApprovalService } from '../../common/approval/approval.service';
import {
  emailInput,
  entityName,
  explode,
  input,
  isFilled,
  now,
  pairAttachments,
  type RequestInput,
} from '../../common/helpers';
import type { LandDefinition, LandGrid } from './land.definitions';
import { at, phpNumber, row, str } from './land.helpers';

/** JSON body of the Land feedback endpoints (the feedback SPs read Status / Error). */
export interface FeedbackCallback {
  Error: boolean;
  Pesan: string;
  Status: number;
}

const FEEDBACK_ACTIONS: Record<
  string,
  { action: string; body: (descs: string, reason: string) => string }
> = {
  R: { action: 'Revision', body: (d, r) => `Please revise ${d} with the reason : ${r}` },
  C: { action: 'Cancellation', body: (d, r) => `${d} has been cancelled with the reason : ${r}` },
  A: { action: 'Approval', body: (d) => `Your Request ${d} has been Approved ` },
};

interface FeedbackMail {
  to: string[];
  cc?: string[];
  template: string;
  context: Record<string, unknown>;
}

/**
 * Feedback mails back to the requester of a Land document:
 *   POST /api/landfph/feedback, /api/landverification/feedback (feedback_fph / feedback_verification)
 *   POST /api/feedbackSph        (mgr.x_send_mail_approval_feedback_land_sph)
 *   POST /api/feedbacksubmission (mgr.x_send_mail_approval_feedback_land_submission)
 */
@Injectable()
export class LandFeedbackService {
  constructor(private readonly approval: ApprovalService) {}

  /** POST /api/landfph/feedback, /api/landverification/feedback (FeedbackMail → staffaction). */
  feedback(def: LandDefinition, body: RequestInput): Promise<FeedbackCallback> {
    return this.send(def.feedbackFolder ?? `feedback/feedback_${def.link}`, body, () => [
      {
        to: recipients(body, 'email_addr'),
        template: 'email/staff/staffaction',
        context: this.baseContext(body, pairAttachments(body.url_link, body.file_name)),
      },
    ]);
  }

  /** POST /api/feedbackSph — requester feedback with the SPH details. */
  feedbackSph(body: RequestInput): Promise<FeedbackCallback> {
    return this.send('feedback/feedback_Land_Sph', body, () => [
      {
        to: recipients(body, 'email_addr'),
        template: 'email/land/feedback',
        context: {
          ...this.baseContext(body, pairAttachments(body.url_link, body.file_name)),
          rows: [
            row('Nomor Dokumen', body.doc_no),
            row('Kode SPH', body.code_sph),
            row('NOP', body.nop_no),
            row('Nama Pemilik', body.name_owner),
            row('Luas Tanah yang disepakati', `${phpNumber(body.laf)} m²`),
            row('Luas Bangunan yang disepakati', `${phpNumber(body.baf)} m²`),
            row('Periode', body.periode),
            row('Tanggal Penandatanganan SPH', body.transaction_date),
          ],
          approve_list: approvers(body),
        },
      },
    ]);
  }

  /**
   * POST /api/feedbacksubmission — submission feedback to the requester (+ email_cc, all attachments)
   * and, on approval, to email_addr2 (+ email_cc2) with the class-10 attachment (url_file2 / file_name2).
   */
  feedbackSubmission(body: RequestInput): Promise<FeedbackCallback> {
    return this.send('feedback/feedback_Land_Submission', body, () => {
      const types = explode(body.type, ';');
      const grid: LandGrid = {
        headers: ['No', 'Rincian', 'Nama Pemilik', 'NOP', 'Nominal'],
        rows: types.map((t, i) => [
          String(i + 1),
          t,
          at(explode(body.owner, ';'), i),
          at(explode(body.nop_no, ';'), i),
          `Rp. ${phpNumber(at(explode(body.request_amt, ';'), i))}`,
        ]),
      };
      const shared = {
        rows: [
          row('Nomor Dokumen', body.doc_no),
          row('No. Transaksi SPH', body.sph_trx_no),
          row('Total Pengajuan', `Rp. ${phpNumber(body.sum_amt)}`),
        ],
        grid,
        approve_list: approvers(body),
      };
      const mails: FeedbackMail[] = [
        {
          to: recipients(body, 'email_addr'),
          cc: recipients(body, 'email_cc'),
          template: 'email/land/feedback',
          context: {
            ...this.baseContext(body, pairAttachments(body.url_file, body.file_name)),
            ...shared,
          },
        },
      ];
      const second = recipients(body, 'email_addr2');
      if (second.length && str(body.status).toUpperCase() === 'A') {
        mails.push({
          to: second,
          cc: recipients(body, 'email_cc2'),
          template: 'email/land/feedback',
          context: {
            ...this.baseContext(body, pairAttachments(body.url_file2, body.file_name2)),
            ...shared,
          },
        });
      }
      return mails;
    });
  }

  private baseContext(body: RequestInput, attachments: ReturnType<typeof pairAttachments>) {
    const status = str(body.status).toUpperCase();
    const known = FEEDBACK_ACTIONS[status];
    return {
      doc_no: body.doc_no ?? null,
      action: known?.action ?? '',
      reason: body.reason ?? null,
      descs: body.descs ?? null,
      subject: body.subject ?? null,
      bodyEMail: known ? known.body(str(body.descs), str(body.reason)) : '',
      user_name: body.user_name ?? null,
      staff_act_send: body.staff_act_send ?? null,
      entity_name: entityName(body.entity_name),
      status: body.status ?? null,
      entity_cd: body.entity_cd ?? null,
      attachments,
      action_date: now('DD-MM-YYYY HH:mm'),
    };
  }

  /**
   * Sends every mail once (marker per recipient group under storage/app/mail_cache/<folder>) and
   * answers { Error, Pesan, Status } with Status 200 when sent / already sent.
   */
  private async send(
    folder: string,
    body: RequestInput,
    build: () => FeedbackMail[],
  ): Promise<FeedbackCallback> {
    const action = FEEDBACK_ACTIONS[str(body.status).toUpperCase()]?.action ?? '';
    try {
      const mails = build();
      if (!mails[0]?.to.length) {
        this.approval.log.warning('sendmail', 'Tidak ada alamat email yang diberikan.');
        return { Error: true, Pesan: 'Tidak ada alamat email yang diberikan.', Status: 400 };
      }

      let sent = 0;
      for (const [i, mail] of mails.entries()) {
        if (!mail.to.length) continue;
        const marker = this.approval.guard.markerPath(
          folder,
          [body.approve_seq, body.entity_cd, body.doc_no, body.status, ...(i ? [i + 1] : [])],
          'email_feedback_sent',
        );
        const result = await this.approval.guard.once(marker, () =>
          this.approval.mail.send({
            to: mail.to,
            cc: mail.cc?.length ? mail.cc : undefined,
            subject: `${str(body.subject)} ${str(body.descs)}`,
            template: mail.template,
            context: mail.context,
          }),
        );
        if (result === 'sent') {
          sent++;
          const cc = mail.cc?.length ? ` & CC ke : ${mail.cc.join(', ')}` : '';
          this.approval.log.info(
            'sendmailfeedback',
            `Email Feedback ${action} doc_no ${str(body.doc_no)} Entity ${str(body.entity_cd)} berhasil dikirim ke: ${mail.to.join(', ')}${cc}`,
          );
        }
      }
      return sent
        ? { Error: false, Pesan: 'Email berhasil dikirim.', Status: 200 }
        : { Error: false, Pesan: 'Email sudah dikirim sebelumnya.', Status: 200 };
    } catch (err) {
      this.approval.log.error('sendmail', `Gagal mengirim email: ${(err as Error).message}`);
      return { Error: true, Pesan: 'Gagal mengirim email. Cek log untuk detailnya.', Status: 500 };
    }
  }
}

/** ';'-separated, lower-cased address list of a request field. */
function recipients(body: RequestInput, key: string): string[] {
  return explode(emailInput(body, key), ';')
    .map((e) => e.trim())
    .filter(Boolean);
}

/** "name (dd/MM/yyyy HH:mm)" per approver from approve_exist / approved_date ('; ' lists). */
function approvers(body: RequestInput): string[] {
  const dates = explode(input(body, 'approved_date') ?? '', ';').map((d) => d.trim());
  return explode(body.approve_exist, ';')
    .map((name, i) => ({ name: name.trim(), date: dates[i] }))
    .filter(({ name }) => isFilled(name))
    .map(({ name, date }) => (isFilled(date) ? `${name} (${date})` : name));
}
