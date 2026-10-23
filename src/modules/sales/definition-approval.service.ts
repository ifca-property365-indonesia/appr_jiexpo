import { Injectable } from '@nestjs/common';
import {
  ApprovalService,
  type ApprovalKey,
  type LinkData,
} from '../../common/approval/approval.service';
import { normalizeReason } from '../../common/approval/approval-status';
import {
  approverList,
  emailInput,
  entityName,
  formatDate,
  input,
  isFilled,
  type Attachment,
  type RequestInput,
} from '../../common/helpers';

/** Label / value row of views/partials/detail-table (undefined → row skipped). */
export type DetailRow = [label: string, value: string | undefined];

/**
 * One approval document driven by an `mgr.xrl_send_mail_approval_*` stored procedure (Sales / TM).
 * The SP posts its JSON body to POST /api/<link>; the approver's action calls the same SP back with `args`.
 */
export interface ApprovalDefinition {
  /** Route segment = URL suffix the SP posts to (after mgr.ar_spec.api_mail). */
  link: string;
  /** Document label: subject, intro sentence, restricted / result pages (encrypted as `text`). */
  label: string;
  /** mgr.cb_cash_request_appr.type */
  type: string;
  /** mgr.cb_cash_request_appr.module (encrypted as `type_module`). */
  module: 'SA' | 'TM';
  procedure: string;
  template: string;
  cacheFolder: string;
  logLabel: string;
  /** false → the SP has no remarks parameter: the confirmation form shows no reason field. */
  remarks: boolean;
  /** SP-specific keys added to the encrypted link payload (whatever `args` needs besides the standard keys). */
  payload: (body: RequestInput) => Record<string, unknown>;
  /** SP arguments in the exact parameter order of `procedure`. */
  args: (data: LinkData, status: string, reason: string) => unknown[];
  /** Email detail rows. */
  rows: (body: RequestInput) => DetailRow[];
  /** Email attachment links (default none). */
  attachments?: (body: RequestInput) => Attachment[];
}

/** Request value, or undefined when blank / "EMPTY" (so the detail row is skipped). */
export function opt(body: RequestInput, key: string): string | undefined {
  const v = input(body, key);
  return isFilled(v) ? v.trim() : undefined;
}

/** Date value formatted as "05 January 2025", or undefined when blank / unparsable. */
export function optDate(body: RequestInput, key: string): string | undefined {
  return formatDate(body?.[key], 'DD MMMM YYYY') || undefined;
}

/** "url1; EMPTY; url2" → [{ url, file_name: 'Attachment 1' }, ...] (SP url lists carry no file names). */
export function urlAttachments(value: unknown, separator = ';'): Attachment[] {
  return String(value ?? '')
    .split(separator)
    .map((u) => u.trim())
    .filter((u) => isFilled(u) && /^https?:\/\//i.test(u))
    .map((url, i) => ({ url, file_name: `Attachment ${i + 1}` }));
}

/** Columns of mgr.cb_cash_request_appr that identify the pending row of an email link. */
const KEY_FIELDS: (keyof ApprovalKey)[] = [
  'doc_no',
  'entity_cd',
  'approve_seq',
  'level_no',
  'type',
  'module',
];

/**
 * Generic 3-step flow for SP-driven approvals:
 *  POST /api/<link>                  → email once, JSON callback { data: { encrypted }, Error, Pesan, Status }
 *  GET  /api/<link>/:status/:encrypt → confirmation form (if the row is still pending)
 *  POST /api/<link>/getaccess        → EXEC procedure with def.args(...) → result page
 */
@Injectable()
export class DefinitionApprovalService {
  constructor(private readonly approval: ApprovalService) {}

  async mail(def: ApprovalDefinition, body: RequestInput) {
    const entity = entityName(body.entity_name);
    const docNo = input(body, 'doc_no') ?? '';
    const encrypted = await this.approval.links.issue({
      entity_cd: input(body, 'entity_cd'),
      doc_no: input(body, 'doc_no'),
      level_no: input(body, 'level_no'),
      approve_seq: input(body, 'approve_seq'),
      user_id: input(body, 'user_id'),
      ...def.payload(body),
      email_address: input(body, 'email_addr'),
      entity_name: entity,
      type: def.type,
      type_module: def.module,
      text: def.label,
    });

    const outcome = await this.approval.sendApprovalMail({
      email: emailInput(body),
      subject: `Need Approval for ${def.label} No. ${docNo}`,
      template: def.template,
      entityName: entity,
      context: {
        link: def.link,
        encrypt: encrypted,
        entity_name: entity,
        label: def.label,
        user_name: input(body, 'user_name'),
        descs: opt(body, 'descs'),
        rows: def.rows(body),
        attachments: def.attachments?.(body) ?? [],
        approve_list: approverList(body.approve_exist),
        clarify_user: input(body, 'clarify_user'),
        clarify_email: input(body, 'clarify_email'),
        sender_name: input(body, 'sender_name') ?? '',
        // the SPs send no sender address; '' keeps the signature from rendering mailto:undefined
        sender_addr: input(body, 'sender_addr') ?? '',
      },
      cacheFolder: def.cacheFolder,
      // user_id: several approvers can share one level; approve_seq: a resubmission after revise is a new mail
      cacheKeys: [body.approve_seq, body.entity_cd, body.doc_no, body.level_no, body.user_id],
      logLabel: def.logLabel,
      docNo: body.doc_no,
      entityCd: body.entity_cd,
    });
    return this.approval.outcomeCallback(outcome, { encrypted });
  }

  confirm(def: ApprovalDefinition, status: string, encrypt: string): Promise<string> {
    return this.approval.confirmationPage({
      status,
      encrypt,
      keyFields: KEY_FIELDS,
      label: def.label,
      form: def.remarks
        ? { action: `api/${def.link}/getaccess`, reasonOnApprove: 'comment' }
        : { action: `api/${def.link}/getaccess`, showReason: false },
    });
  }

  async getAccess(def: ApprovalDefinition, body: RequestInput): Promise<string> {
    const status = input(body, 'status') ?? '';
    const data = await this.approval.links.resolve<LinkData>(input(body, 'encrypt') ?? '');
    return this.approval.runAction({
      status,
      docNo: data.doc_no,
      text: def.label,
      procedure: def.procedure,
      args: def.args(data, status, normalizeReason(body.reason, 'no note')),
      entityName: data.entity_name,
    });
  }
}
