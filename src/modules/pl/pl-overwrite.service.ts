import { Injectable } from '@nestjs/common';
import { ApprovalService, type LinkData } from '../../common/approval/approval.service';
import { normalizeReason } from '../../common/approval/approval-status';
import {
  approverList,
  emailInput,
  entityName,
  input,
  numberFormat,
  type RequestInput,
} from '../../common/helpers';

const TEXT = 'Overwrite Actual Inventory';
const LINK = 'ploverwrite';

/** Overwrite Actual Inventory (Laravel PlOverwriteController). */
@Injectable()
export class PlOverwriteService {
  constructor(private readonly approval: ApprovalService) {}

  /**
   * POST /api/ploverwrite — Laravel PlOverwriteController@index. JSON callback
   * { data: { encrypted }, Error, Pesan, Status } with HTTP status = Status; mgr.xrl_send_mail_approval_pl_overwrite
   * reads Status / Error / data.encrypted only (Laravel also echoed the whole payload, dropped here).
   */
  async mail(body: RequestInput) {
    const entity = entityName(body.entity_name);
    const orNull = (key: string) => input(body, key) ?? null;

    const payload = {
      user_id: orNull('user_id'),
      level_no: orNull('level_no'),
      entity_cd: orNull('entity_cd'),
      project_no: orNull('project_no'),
      doc_no: orNull('doc_no'),
      approve_seq: orNull('approve_seq'),
      email_addr: orNull('email_addr'),
      user_name: orNull('user_name'),
      sender_addr: orNull('sender_addr'),
      sender_name: orNull('sender_name'),
      entity_name: entity,
      descs: orNull('descs'),
      approve_list: approverList(body.approve_exist),
      amount: numberFormat(body.amount),
      clarify_user: orNull('sender_name'),
      clarify_email: orNull('sender_addr'),
      subject: `Need Approval for ${input(body, 'doc_no') ?? ''}`,
      link: LINK,
    };

    const encrypted = await this.approval.links.issue({
      entity_cd: input(body, 'entity_cd'),
      project_no: input(body, 'project_no'),
      email_address: input(body, 'email_addr'),
      level_no: input(body, 'level_no'),
      approve_seq: input(body, 'approve_seq'),
      doc_no: input(body, 'doc_no'),
      entity_name: entity,
      type: 'A',
      type_module: 'PL',
      text: TEXT,
    });

    const outcome = await this.approval.sendApprovalMail({
      email: emailInput(body),
      subject: payload.subject,
      template: 'email/pl/overwrite',
      entityName: entity,
      context: {
        ...payload,
        encrypt: encrypted,
      },
      cacheFolder: 'send_Land_PL_Overwrite',
      cacheKeys: [body.approve_seq, body.entity_cd, body.doc_no, body.level_no],
      logLabel: TEXT,
      docNo: body.doc_no,
      entityCd: body.entity_cd,
    });
    return this.approval.outcomeCallback(outcome, { encrypted });
  }

  /** GET /api/ploverwrite/:status/:encrypt */
  confirm(status: string, encrypt: string): Promise<string> {
    return this.approval.confirmationPage({
      status,
      encrypt,
      keyFields: ['doc_no', 'entity_cd', 'approve_seq', 'level_no', 'type', 'module'],
      // Laravel posted to api/landsplitshgb/getaccess (copy-paste bug) — fixed to this module.
      form: { action: `api/${LINK}/getaccess`, reasonOnApprove: 'hidden' },
    });
  }

  /** POST /api/ploverwrite/getaccess */
  async getAccess(body: RequestInput): Promise<string> {
    const status = input(body, 'status') ?? '';
    const data = await this.approval.links.resolve<LinkData>(input(body, 'encrypt') ?? '');
    return this.approval.runAction({
      status,
      docNo: data.doc_no,
      text: TEXT,
      procedure: 'mgr.xrl_send_mail_approval_pl_overwrite',
      args: [
        data.entity_cd,
        data.project_no,
        data.doc_no,
        status,
        data.level_no,
        normalizeReason(body.reason, 'no reason'),
      ],
      entityName: data.entity_name,
    });
  }
}
