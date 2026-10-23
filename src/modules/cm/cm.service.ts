import { Injectable } from '@nestjs/common';
import {
  ApprovalService,
  type LinkData,
  type SendOutcome,
} from '../../common/approval/approval.service';
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

/**
 * Contract Management approvals (Laravel CmDone/CmClose/CmEntry/CmProgress/CmProgresswu/VarianOrder/
 * ContractRenew controllers) — same 3-step flow, differing only in the constants below.
 */
export interface CmDefinition {
  /** Route segment and email link, e.g. 'cmdone'. */
  link: string;
  /** Document label used in the subject, restricted pages and result pages. */
  label: string;
  /** "already processed" wording (CmDone / CmClose use lower case). */
  alreadyPrefix?: string;
  procedure: string;
  cacheFolder: string;
  logLabel: string;
  template: string;
  /** Separator of url_file / file_name (the SPs join with '; '); undefined → the email has no attachment list. */
  attachmentSeparator?: string;
  /** Encrypted link payload (data2Encrypt incl. type / type_module / text), keys in PHP order. */
  payload: (body: RequestInput, entity: string) => Record<string, unknown>;
  /** Mail marker key parts. */
  cacheKeys: (body: RequestInput) => unknown[];
  /** Template-specific fields. */
  context?: (body: RequestInput) => Record<string, unknown>;
  /** Stored procedure arguments, in PHP order. */
  args: (data: LinkData, status: string, reason: string) => unknown[];
  /** Plain-text responses that differ from ApprovalService.outcomeText(). */
  sentText?: string;
  noEmailText?: string;
}

/** data2Encrypt shared by the CM controllers; `withEntity` adds entity_name after supervisor. */
function cmPayload(type: string, text: string, withEntity: boolean) {
  return (body: RequestInput, entity: string): Record<string, unknown> => ({
    entity_cd: input(body, 'entity_cd'),
    project_no: input(body, 'project_no'),
    email_address: input(body, 'email_addr'),
    level_no: input(body, 'level_no'),
    doc_no: input(body, 'doc_no'),
    ref_no: input(body, 'ref_no'),
    usergroup: input(body, 'usergroup'),
    user_id: input(body, 'user_id'),
    supervisor: input(body, 'supervisor'),
    ...(withEntity ? { entity_name: entity } : {}),
    type,
    type_module: 'CM',
    text,
  });
}

const docKeys = (b: RequestInput): unknown[] => [b.approve_seq, b.entity_cd, b.doc_no, b.level_no];

const cmArgs = (d: LinkData, status: string, reason: string): unknown[] => [
  d.entity_cd,
  d.project_no,
  d.doc_no,
  d.ref_no,
  status,
  d.level_no,
  d.usergroup,
  d.user_id,
  d.supervisor,
  reason,
];

/** Fields of email/cm/progress (CmProgress + CmProgresswu). */
const progressContext = (b: RequestInput) => ({
  contract_desc: input(b, 'contract_desc'),
  curr_cd: input(b, 'curr_cd'),
  amount: numberFormat(b.amount),
  prev_progress_amt: numberFormat(b.prev_progress_amt),
  curr_progress: numberFormat(b.curr_progress),
  prev_progress: numberFormat(b.prev_progress),
  progress_no: input(b, 'progress_no'),
  surveyor: input(b, 'surveyor'),
  doc_link: input(b, 'url_link'),
});

export const CM_DONE: CmDefinition = {
  link: 'cmdone',
  label: 'Contract Complete',
  alreadyPrefix: 'You have already made a request to',
  procedure: 'mgr.xrl_send_mail_approval_cm_contractdone',
  cacheFolder: 'send_cmdone',
  logLabel: 'CM Done',
  template: 'email/cm/contract',
  attachmentSeparator: '; ',
  payload: cmPayload('B', 'Contract Progress', true),
  cacheKeys: docKeys,
  args: cmArgs,
};

export const CM_CLOSE: CmDefinition = {
  ...CM_DONE,
  link: 'cmclose',
  label: 'Contract Close',
  procedure: 'mgr.xrl_send_mail_approval_cm_contractclose',
  cacheFolder: 'send_cmclose',
  logLabel: 'Contract Close',
  payload: cmPayload('C', 'Contract Progress', true),
};

export const CM_ENTRY: CmDefinition = {
  link: 'cmentry',
  label: 'Contract Entry',
  procedure: 'mgr.xrl_send_mail_approval_cm_contract_entry',
  cacheFolder: 'send_cmentry',
  logLabel: 'CM Entry',
  template: 'email/cm/entry',
  attachmentSeparator: '; ',
  payload: cmPayload('E', 'Contract Entry', false),
  cacheKeys: docKeys,
  context: (b) => ({
    curr_cd: input(b, 'curr_cd'),
    contract_amt: numberFormat(b.contract_amt),
    contract_no: input(b, 'contract_no'),
    works_descs: input(b, 'works_descs'),
    doc_link: input(b, 'doc_link'),
  }),
  args: cmArgs,
};

export const CM_PROGRESS: CmDefinition = {
  link: 'cmprogress',
  label: 'Contract Progress',
  procedure: 'mgr.xrl_send_mail_approval_cm_progress',
  cacheFolder: 'send_cmprogress',
  logLabel: 'CM Progress',
  template: 'email/cm/progress',
  attachmentSeparator: '; ',
  payload: cmPayload('A', 'Contract Progress', false),
  cacheKeys: docKeys,
  context: progressContext,
  args: cmArgs,
};

/** Contract Progress with unit — same email, JSON response (see CmService.mailJson). */
export const CM_PROGRESS_WU: CmDefinition = {
  ...CM_PROGRESS,
  link: 'cmprogresswu',
  procedure: 'mgr.xrl_send_mail_approval_cm_progress_with_unit',
  cacheFolder: 'send_cmprogresswu',
  payload: cmPayload('F', 'Contract Progress', false),
};

export const VARIAN_ORDER: CmDefinition = {
  link: 'varianorder',
  label: 'Varian Order',
  procedure: 'mgr.xrl_send_mail_approval_cm_varianorder',
  cacheFolder: 'send_varianorder',
  logLabel: 'Varian Order',
  template: 'email/cm/varian-order',
  attachmentSeparator: '; ',
  payload: cmPayload('D', 'Varian Order', false),
  cacheKeys: (b): unknown[] => [b.approve_seq, b.entity_cd, b.doc_no, b.status, b.level_no],
  context: (b) => ({
    doc_no: input(b, 'doc_no'),
    curr_cd: input(b, 'curr_cd'),
    vo_sub_amt: numberFormat(b.vo_sub_amt),
    doc_link: input(b, 'doc_link'),
  }),
  args: cmArgs,
  noEmailText: 'Tidak ada alamat email yang diberikan',
};

export const CONTRACT_RENEW: CmDefinition = {
  link: 'contractrenew',
  label: 'Contract Renew',
  procedure: 'mgr.xrl_send_mail_approval_tm_contractrenew',
  cacheFolder: 'send_contract_renew',
  logLabel: 'Contract Renew',
  template: 'email/cm/contract-renew',
  payload: (b) => ({
    entity_cd: input(b, 'entity_cd'),
    project_no: input(b, 'project_no'),
    doc_no: input(b, 'doc_no'),
    ref_no: input(b, 'ref_no'),
    renew_no: input(b, 'renew_no'),
    level_no: input(b, 'level_no'),
    usergroup: input(b, 'usergroup'),
    user_id: input(b, 'user_id'),
    supervisor: input(b, 'supervisor'),
    email_address: input(b, 'email_addr'),
    type: 'R',
    type_module: 'TM',
    text: 'Contract Renew',
  }),
  cacheKeys: (b): unknown[] => [b.approve_seq, b.entity_cd, b.ref_no, b.level_no],
  context: (b) => ({
    currency_cd: input(b, 'currency_cd'),
    contract_sum: numberFormat(b.contract_sum),
  }),
  args: (d, status, reason): unknown[] => [
    d.entity_cd,
    d.project_no,
    d.doc_no,
    d.ref_no,
    d.renew_no,
    status,
    d.level_no,
    d.usergroup,
    d.user_id,
    d.supervisor,
    reason,
  ],
  sentText: 'Email berhasil dikirim',
};

@Injectable()
export class CmService {
  constructor(private readonly approval: ApprovalService) {}

  /** POST /api/<link> — plain-text response. */
  async mail(def: CmDefinition, body: RequestInput): Promise<string> {
    const outcome = await this.send(
      def,
      body,
      await this.approval.links.issue(def.payload(body, entityName(body.entity_name))),
    );
    if (outcome.kind === 'sent' && def.sentText) return def.sentText;
    if (outcome.kind === 'no-email' && def.noEmailText) return def.noEmailText;
    return this.approval.outcomeText(outcome);
  }

  /**
   * POST /api/cmprogresswu — JSON callback { data: { encrypted }, Error, Pesan, Status }, HTTP status = Status.
   * mgr.xrl_send_mail_approval_cm_progress_with_unit reads Status / Error / data.encrypted only (Laravel also
   * echoed the whole request payload, dropped here).
   */
  async mailJson(def: CmDefinition, body: RequestInput) {
    const encrypted = await this.approval.links.issue(def.payload(body, entityName(body.entity_name)));
    const outcome = await this.send(def, body, encrypted);
    return this.approval.outcomeCallback(outcome, { encrypted });
  }

  private send(def: CmDefinition, body: RequestInput, encrypted: string): Promise<SendOutcome> {
    const entity = entityName(body.entity_name);
    const docNo = input(body, 'doc_no');
    const sep = def.attachmentSeparator;
    const files = sep ? explode(body.file_name, sep) : [];
    const attachments = sep
      ? explode(body.url_file, sep).map((url, i) => ({ url, file_name: files[i] ?? '' }))
      : [];

    return this.approval.sendApprovalMail({
      email: emailInput(body),
      subject: `Need Approval for ${def.label} No.  ${docNo ?? ''}`,
      template: def.template,
      entityName: entity,
      context: {
        link: def.link,
        encrypt: encrypted,
        entity_name: entity,
        label: def.label,
        user_name: input(body, 'user_name'),
        descs: input(body, 'descs'),
        attachments,
        approve_list: approverList(body.approve_exist),
        clarify_user: input(body, 'clarify_user'),
        clarify_email: input(body, 'clarify_email'),
        sender_name: input(body, 'sender'),
        sender_addr: input(body, 'sender_addr'),
        ...def.context?.(body),
      },
      cacheFolder: def.cacheFolder,
      cacheKeys: def.cacheKeys(body),
      logLabel: def.logLabel,
      docNo: body.doc_no,
      entityCd: body.entity_cd,
    });
  }

  /** GET /api/<link>/:status/:encrypt */
  confirm(def: CmDefinition, status: string, encrypt: string): Promise<string> {
    return this.approval.confirmationPage({
      status,
      encrypt,
      label: def.label,
      alreadyPrefix: def.alreadyPrefix,
      form: { action: `api/${def.link}/getaccess` },
    });
  }

  /** POST /api/<link>/getaccess — Laravel <Controller>@update. */
  async update(def: CmDefinition, body: RequestInput): Promise<string> {
    const status = input(body, 'status') ?? '';
    const data = await this.approval.links.resolve<LinkData>(input(body, 'encrypt') ?? '');
    return this.approval.runAction({
      status,
      docNo: data.doc_no,
      text: def.label,
      procedure: def.procedure,
      args: def.args(data, status, normalizeReason(body.reason, '0')),
    });
  }
}
