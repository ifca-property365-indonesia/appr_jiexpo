import { Injectable } from '@nestjs/common';
import { ApprovalService } from '../../common/approval/approval.service';
import { normalizeReason } from '../../common/approval/approval-status';
import {
  approverList,
  emailInput,
  entityName,
  explode,
  input,
  pairAttachments,
  type RequestInput,
} from '../../common/helpers';
import { phpNumber } from './land.helpers';

const LINK = 'landsubmission';
const TEXT = 'Land Submission';

/** Land payment submission (Laravel LandSubmissionController) — plain-text response, own update route. */
@Injectable()
export class LandSubmissionService {
  constructor(private readonly approval: ApprovalService) {}

  /** POST /api/landsubmission */
  async mail(body: RequestInput): Promise<string> {
    const entity = entityName(body.entity_name);
    const encrypted = await this.approval.links.issue({
      entity_cd: input(body, 'entity_cd'),
      doc_no: input(body, 'doc_no'),
      level_no: input(body, 'level_no'),
      user_id: input(body, 'user_id'),
      email_addr: input(body, 'email_addr'),
      entity_name: entity,
      type: 'E',
      type_module: 'LM',
      text: TEXT,
    });

    const outcome = await this.approval.sendApprovalMail({
      email: emailInput(body),
      subject: `Need Approval ${input(body, 'desc_sub') ?? ''}`,
      template: 'email/land/submission',
      entityName: entity,
      context: {
        link: LINK,
        encrypt: encrypted,
        entity_name: entity,
        user_name: input(body, 'user_name'),
        desc_sub: input(body, 'desc_sub'),
        request_amt: explode(body.request_amt, ';')
          .map((v) => phpNumber(v))
          .join(', '),
        submission_no: input(body, 'submission_no'),
        attachments: pairAttachments(body.url_file, body.file_name),
        approve_list: approverList(body.approve_exist),
        clarify_user: input(body, 'clarify_user'),
        clarify_email: input(body, 'clarify_email'),
        sender_name: input(body, 'sender'),
        sender_addr: input(body, 'sender_addr'),
      },
      cacheFolder: 'send_Land_Submission',
      cacheKeys: [body.approved_seq, body.entity_cd, body.doc_no, body.level_no],
      logLabel: TEXT,
      docNo: body.doc_no,
      entityCd: body.entity_cd,
    });
    // This controller answered "Failed to send email: ..." instead of "Gagal mengirim email: ...".
    return outcome.kind === 'failed'
      ? `Failed to send email: ${outcome.error}`
      : this.approval.outcomeText(outcome);
  }

  /** GET /api/landsubmission/:status/:encrypt — landsubmission/passcheckwithremark (no approve_seq in the key). */
  confirm(status: string, encrypt: string): Promise<string> {
    return this.approval.confirmationPage({
      status,
      encrypt,
      form: { action: `api/${LINK}/update` },
    });
  }

  /** POST /api/landsubmission/update */
  async update(body: RequestInput): Promise<string> {
    const status = input(body, 'status') ?? '';
    const data = await this.approval.links.resolve(input(body, 'encrypt') ?? '');
    return this.approval.runAction({
      status,
      docNo: data.doc_no,
      text: TEXT,
      procedure: 'mgr.xrl_send_mail_approval_land_submission',
      args: [data.entity_cd, data.doc_no, status, data.level_no, normalizeReason(body.reason, '0')],
      entityName: data.entity_name,
    });
  }
}
