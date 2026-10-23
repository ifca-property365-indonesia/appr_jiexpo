import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ApprovalService, type LinkData } from '../../common/approval/approval.service';
import { MailDataRegistry } from '../../common/approval/maildata.registry';
import {
  approverList,
  emailInput,
  entityName,
  explode,
  input,
  numberFormat,
  type RequestInput,
} from '../../common/helpers';
import { poOutcomeText } from './po.constants';

/**
 * PO modules reached through the generic dispatcher (POST /api/maildata module=<module>,
 * GET /api/processdata/<module>/..., POST /api/getaccess): Laravel PoOrderController and
 * PoRequestController.
 */
export interface PoMailDataDef {
  /** Laravel module name (`<module>Controller`), also used in the email links. */
  module: 'PoOrder' | 'PoRequest';
  text: string;
  procedure: string;
  cacheFolder: string;
  logLabel: string;
  template: string;
  /** Prefix of the plain-text response when sending fails. */
  failedPrefix: string;
  subject(body: RequestInput): string;
  /** data2Encrypt — key order as in PHP. */
  payload(body: RequestInput): Record<string, unknown>;
  /** Module-specific email fields. */
  details(body: RequestInput): Record<string, unknown>;
  /** Stored procedure arguments in PHP bind order. */
  args(data: LinkData, status: string, reason: string): unknown[];
}

const list = (value: unknown) => explode(value, '; ');

export const PO_ORDER: PoMailDataDef = {
  module: 'PoOrder',
  text: 'Purchase Order',
  procedure: 'mgr.x_send_mail_approval_po_order',
  cacheFolder: 'send_porder',
  logLabel: 'Purchase Order',
  template: 'email/po/order',
  failedPrefix: 'Failed to send email: ',
  subject: (b) => `Need Approval for Purchase Order No.  ${input(b, 'doc_no') ?? ''}`,
  payload: (b) => ({
    entity_cd: input(b, 'entity_cd'),
    project_no: input(b, 'project_no'),
    doc_no: input(b, 'doc_no'),
    trx_type: input(b, 'trx_type'),
    level_no: input(b, 'level_no'),
    usergroup: input(b, 'usergroup'),
    user_id: input(b, 'user_id'),
    supervisor: input(b, 'supervisor'),
    email_address: input(b, 'email_addr'),
    type: 'A',
    type_module: 'PO',
    text: 'Purchase Order',
  }),
  details: (b) => ({
    curr_cd: input(b, 'curr_cd'),
    po_amt: numberFormat(b.po_amt),
    supplier_name: list(b.supplier_name),
    order_no: list(b.order_no),
    order_remarks: list(b.order_remarks),
    remark: list(b.remark),
  }),
  args: (d, status, reason) => [
    d.entity_cd,
    d.project_no,
    d.doc_no,
    d.trx_type,
    status,
    d.level_no,
    d.usergroup,
    d.user_id,
    d.supervisor,
    reason,
  ],
};

export const PO_REQUEST: PoMailDataDef = {
  module: 'PoRequest',
  text: 'Purchase Requisition',
  procedure: 'mgr.x_send_mail_approval_po_request',
  // "porequeset" (sic) — kept so markers written by the PHP app are still honoured.
  cacheFolder: 'send_porequeset',
  logLabel: 'Purchase Requisition',
  template: 'email/po/request',
  failedPrefix: 'Gagal mengirim email: ',
  subject: (b) => `Need Approval for Purchase Requisition No.  ${input(b, 'req_hd_no') ?? ''}`,
  payload: (b) => ({
    entity_cd: input(b, 'entity_cd'),
    project_no: input(b, 'project_no'),
    email_address: input(b, 'email_addr'),
    level_no: input(b, 'level_no'),
    doc_no: input(b, 'doc_no'),
    usergroup: input(b, 'usergroup'),
    user_id: input(b, 'user_id'),
    supervisor: input(b, 'supervisor'),
    type: 'Q',
    type_module: 'PO',
    text: 'Purchase Requisition',
  }),
  details: (b) => ({
    // PHP computed a flattened copy but passed the raw value to the view.
    req_hd_descs: input(b, 'req_hd_descs'),
    req_hd_no: input(b, 'req_hd_no'),
    curr_cd: input(b, 'curr_cd'),
    total_price: numberFormat(b.total_price),
  }),
  // mgr.x_send_mail_approval_po_request has no trx_type parameter.
  args: (d, status, reason) => [
    d.entity_cd,
    d.project_no,
    d.doc_no,
    status,
    d.level_no,
    d.usergroup,
    d.user_id,
    d.supervisor,
    reason,
  ],
};

export const PO_MAILDATA_DEFS = [PO_ORDER, PO_REQUEST] as const;

@Injectable()
export class PoMailDataService implements OnModuleInit {
  constructor(
    private readonly approval: ApprovalService,
    private readonly registry: MailDataRegistry,
  ) {}

  onModuleInit(): void {
    for (const def of PO_MAILDATA_DEFS) {
      this.registry.register(def.module, {
        processModule: (body) => this.processModule(def, body),
        update: (status, encrypt, reason) => this.update(def, status, encrypt, reason),
      });
    }
  }

  /** POST /api/maildata module=<def.module> — Laravel <module>Controller@processModule. */
  async processModule(def: PoMailDataDef, body: RequestInput): Promise<string> {
    const entity = entityName(body.entity_name);
    const urls = list(body.url_file);
    const files = list(body.file_name);

    const outcome = await this.approval.sendApprovalMail({
      email: emailInput(body),
      subject: def.subject(body),
      template: def.template,
      entityName: entity,
      context: {
        ...def.details(body),
        link: `processdata/${def.module}`,
        encrypt: this.approval.crypt.encrypt(def.payload(body)),
        entity_name: entity,
        user_name: input(body, 'user_name'),
        attachments: urls.map((url, i) => ({ url, file_name: files[i] ?? '' })),
        doc_links: list(body.document_link),
        approve_list: approverList(body.approve_exist),
        clarify_user: input(body, 'clarify_user'),
        clarify_email: input(body, 'clarify_email'),
        sender_name: input(body, 'sender'),
        sender_addr: input(body, 'sender_addr'),
      },
      cacheFolder: def.cacheFolder,
      cacheKeys: [body.approve_seq, body.entity_cd, body.doc_no, body.level_no],
      logLabel: def.logLabel,
      docNo: body.doc_no,
      entityCd: body.entity_cd,
    });
    return poOutcomeText(this.approval, outcome, def.failedPrefix);
  }

  /** POST /api/getaccess module=<def.module> — Laravel <module>Controller@update. */
  update(def: PoMailDataDef, status: string, encrypt: string, reason: string): Promise<string> {
    const data = this.approval.crypt.decrypt<LinkData>(encrypt);
    return this.approval.runAction({
      status,
      docNo: data.doc_no,
      text: def.text,
      procedure: def.procedure,
      args: def.args(data, status, reason),
    });
  }
}
