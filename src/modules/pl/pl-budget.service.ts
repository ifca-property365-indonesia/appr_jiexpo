import { Injectable } from '@nestjs/common';
import { ApprovalService, type LinkData } from '../../common/approval/approval.service';
import { normalizeReason } from '../../common/approval/approval-status';
import {
  approverList,
  emailInput,
  entityName,
  explode,
  input,
  numberFormat,
  type RequestInput,
} from '../../common/helpers';

/** RAB Budget approvals (Laravel PLBudgetRevisionController / PLBudgetLymanController). */
export interface PlBudgetVariant {
  /** Route segment and email link. */
  link: string;
  /** cb_cash_request_appr.TYPE */
  type: 'X' | 'Y';
  /** `text` stored in the encrypted link payload. */
  text: string;
  /** Document label in the subject. */
  mailLabel: string;
  /** Document label in the email body. */
  bodyLabel: string;
  /** Document label in the restricted and result pages. */
  label: string;
  /** Revision carries trx_type (payload, approval key and SP argument); Lyman does not. */
  withTrxType: boolean;
  procedure: string;
  cacheFolder: string;
  logLabel: string;
}

export const BUDGET_REVISION: PlBudgetVariant = {
  link: 'budgetrevision',
  type: 'Y',
  text: 'Budget Revision',
  mailLabel: 'RAB Budget Revision',
  bodyLabel: 'Revision RAB Budget',
  label: 'PL Budget Revision',
  withTrxType: true,
  procedure: 'mgr.xrl_send_mail_approval_pl_budget_revision',
  cacheFolder: 'send_pl_budget_revision',
  logLabel: 'PL Budget Revision',
};

/** Not routed in the Laravel app, but its email (email/plbudget/send) links to /api/budgetlyman/... */
export const BUDGET_LYMAN: PlBudgetVariant = {
  link: 'budgetlyman',
  type: 'X',
  text: 'Budget Lyman',
  mailLabel: 'RAB Budget',
  bodyLabel: 'RAB Budget',
  label: 'RAB Budget',
  withTrxType: false,
  procedure: 'mgr.xrl_send_mail_approval_pl_budget_lyman',
  cacheFolder: 'send_pl_budget_lyman',
  logLabel: 'RAB Budget',
};

@Injectable()
export class PlBudgetService {
  constructor(private readonly approval: ApprovalService) {}

  /** POST /api/<link> — Laravel PLBudget*Controller@Mail. */
  async mail(variant: PlBudgetVariant, body: RequestInput): Promise<string> {
    const docNo = input(body, 'doc_no');
    const entity = entityName(body.entity_name);
    const urls = explode(body.url_file, '; ');
    const files = explode(body.file_name, '; ');

    const encrypted = await this.approval.links.issue({
      entity_cd: input(body, 'entity_cd'),
      project_no: input(body, 'project_no'),
      email_address: input(body, 'email_addr'),
      entity_name: entity,
      level_no: input(body, 'level_no'),
      ...(variant.withTrxType ? { trx_type: input(body, 'trx_type') } : {}),
      doc_no: input(body, 'doc_no'),
      user_id: input(body, 'user_id'),
      type: variant.type,
      type_module: 'PL',
      text: variant.text,
    });

    const outcome = await this.approval.sendApprovalMail({
      email: emailInput(body),
      subject: `Need Approval for ${variant.mailLabel} No. ${docNo ?? ''}`,
      template: 'email/pl/budget',
      entityName: entity,
      context: {
        link: variant.link,
        encrypt: encrypted,
        entity_name: entity,
        doc_label: variant.bodyLabel,
        user_name: input(body, 'user_name'),
        descs: input(body, 'descs'),
        amount: numberFormat(body.amount),
        doc_no: docNo,
        attachments: urls.map((url, i) => ({ url, file_name: files[i] ?? '' })),
        approve_list: approverList(body.approve_exist),
        clarify_user: input(body, 'clarify_user'),
        clarify_email: input(body, 'clarify_email'),
        sender_name: input(body, 'sender'),
        sender_addr: input(body, 'sender_addr'),
      },
      cacheFolder: variant.cacheFolder,
      cacheKeys: [body.approve_seq, body.entity_cd, body.doc_no, body.status, body.level_no],
      logLabel: variant.logLabel,
      docNo: body.doc_no,
      entityCd: body.entity_cd,
    });
    return outcome.kind === 'no-email'
      ? 'Tidak ada alamat email yang diberikan'
      : this.approval.outcomeText(outcome);
  }

  /** GET /api/<link>/:status/:encrypt */
  confirm(variant: PlBudgetVariant, status: string, encrypt: string): Promise<string> {
    return this.approval.confirmationPage({
      status,
      encrypt,
      label: variant.label,
      key: (d) => ({
        doc_no: d.doc_no,
        entity_cd: d.entity_cd,
        level_no: d.level_no,
        type: d.type,
        ...(variant.withTrxType ? { trx_type: d.trx_type } : {}),
        module: d.type_module,
      }),
      form: { action: `api/${variant.link}/getaccess` },
    });
  }

  /** POST /api/<link>/getaccess — the approver's reason goes to @rt_remarks (blank → "no note"). */
  async update(variant: PlBudgetVariant, body: RequestInput): Promise<string> {
    const status = input(body, 'status') ?? '';
    const data = await this.approval.links.resolve<LinkData>(input(body, 'encrypt') ?? '');
    return this.approval.runAction({
      status,
      docNo: data.doc_no,
      text: variant.label,
      procedure: variant.procedure,
      args: [
        data.entity_cd,
        data.project_no,
        data.doc_no,
        ...(variant.withTrxType ? [data.trx_type] : []),
        status,
        data.level_no,
        data.user_id,
        normalizeReason(body.reason, 'no note'),
      ],
      entityName: data.entity_name,
    });
  }
}
