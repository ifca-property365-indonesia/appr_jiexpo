import { Injectable } from '@nestjs/common';
import { ApprovalService } from '../../common/approval/approval.service';
import { emailInput, entityName, input, type RequestInput } from '../../common/helpers';

const NO_FEEDBACK_EMAIL = 'Tidak ada alamat email untuk feedback yang diberikan';

/**
 * RAB Budget feedback emails (Laravel FeedbackPLController), called by
 * mgr.x_send_mail_approval_feedback_pl_budget_lyman / _revision.
 * Request: status, entity_cd, doc_no, reason, approve_seq, descs, subject, user_name,
 * staff_act_send, entity_name, email_cc (unused, as in PHP), email_addr.
 */
export interface PlFeedbackVariant {
  /** mail_cache folder (Laravel feedbackPLBudget*). */
  cacheFolder: string;
  subject: (subject: string, descs: string, docNo: string) => string;
  body: (status: string, descs: string, docNo: string) => string;
}

/** POST /api/feedbackbudgetlyman — FeedbackPLLymanMail (email/staffaction/plbudgetlyman). */
export const FEEDBACK_BUDGET_LYMAN: PlFeedbackVariant = {
  cacheFolder: 'feedbackPLBudgetLyman',
  subject: (subject, _descs, docNo) => `${subject} RAB Budget No. ${docNo}`,
  body: (status, _descs, docNo) => {
    switch (status) {
      case 'R':
        return `Please revise RAB Budget No. ${docNo}`;
      case 'C':
        return `RAB Budget No. ${docNo} has been cancelled with the reason : `;
      case 'A':
        return `Your Request RAB Budget No. ${docNo} has been Approved`;
      default:
        return '';
    }
  },
};

/** POST /api/feedbackbudgetrevision — FeedbackPLRevisionMail (email/staffaction/plbudgetrevision). */
export const FEEDBACK_BUDGET_REVISION: PlFeedbackVariant = {
  cacheFolder: 'feedbackPLBudgetRevision',
  subject: (subject, descs, docNo) => `${subject} ${descs} No. ${docNo}`,
  body: (status, descs, docNo) => {
    switch (status) {
      case 'R':
        return `Please revise ${descs} No. ${docNo}`;
      case 'C':
        return `${descs} No. ${docNo}`;
      case 'A':
        return `Your Request ${descs} No. ${docNo} has been Approved`;
      default:
        return '';
    }
  },
};

@Injectable()
export class PlFeedbackService {
  constructor(private readonly approval: ApprovalService) {}

  /** Plain-text reply like PHP; '' when the email was already sent (PHP returned null). */
  async send(variant: PlFeedbackVariant, body: RequestInput): Promise<string> {
    const { mail, guard, log } = this.approval;
    const docNo = input(body, 'doc_no') ?? '';
    const entityCd = input(body, 'entity_cd') ?? '';
    const descs = input(body, 'descs') ?? '';
    const status = (input(body, 'status') ?? '').toUpperCase();
    const email = emailInput(body);
    const entity = entityName(body.entity_name);

    if (!email) {
      log.warning('sendmail', NO_FEEDBACK_EMAIL);
      log.warning('sendmail', docNo);
      return NO_FEEDBACK_EMAIL;
    }

    try {
      const marker = guard.markerPath(
        variant.cacheFolder,
        [body.approve_seq, body.entity_cd, body.doc_no, body.status],
        'email_feedback_sent',
      );
      const result = await guard.once(marker, () =>
        mail.send({
          to: email,
          subject: variant.subject(input(body, 'subject') ?? '', descs, docNo),
          template: 'email/pl/feedback',
          entityName: entity,
          context: {
            entity_name: entity,
            user_name: input(body, 'user_name'),
            bodyEMail: variant.body(status, descs, docNo),
            staff_act_send: input(body, 'staff_act_send'),
          },
        }),
      );
      if (result !== 'sent') return '';
      log.info(
        'sendmailfeedback',
        `Email Feedback doc_no ${docNo} Entity ${entityCd} berhasil dikirim ke: ${email}`,
      );
      return `Email berhasil dikirim ke: ${email}`;
    } catch (err) {
      const msg = (err as Error).message;
      log.error('sendmail', `Gagal mengirim email: ${msg}`);
      return `Gagal mengirim email: ${msg}`;
    }
  }
}
