import { Injectable } from '@nestjs/common';
import { ApprovalService, type LinkData } from '../../common/approval/approval.service';
import { normalizeReason } from '../../common/approval/approval-status';
import {
  approverList,
  emailInput,
  entityName,
  explode,
  flattenNewlines,
  input,
  numberFormat,
  parseDate,
  type RequestInput,
} from '../../common/helpers';
import { poOutcomeText } from './po.constants';

const TEXT = 'Purchase Selection';
const LINK = 'poselection';

/** Laravel PurchaseSelectionController (quotation approval). */
@Injectable()
export class PurchaseSelectionService {
  constructor(private readonly approval: ApprovalService) {}

  /** POST /api/purchase_selection — PurchaseSelectionController@Mail. */
  async mail(body: RequestInput): Promise<string> {
    const entity = entityName(body.entity_name);
    const urls = explode(body.url_file, '; ');
    const files = explode(body.file_name, '; ');

    const encrypted = this.approval.crypt.encrypt({
      entity_cd: input(body, 'entity_cd'),
      project_no: input(body, 'project_no'),
      doc_no: input(body, 'doc_no'),
      request_no: input(body, 'request_no'),
      trx_date: input(body, 'trx_date'),
      level_no: input(body, 'level_no'),
      usergroup: input(body, 'usergroup'),
      user_id: input(body, 'user_id'),
      supervisor: input(body, 'supervisor'),
      type: 'S',
      type_module: 'PO',
      text: TEXT,
    });

    const outcome = await this.approval.sendApprovalMail({
      email: emailInput(body),
      subject: `Need Approval for Quotation No.  ${input(body, 'po_doc_no') ?? ''}`,
      template: 'email/po/selection',
      entityName: entity,
      context: {
        link: LINK,
        encrypt: encrypted,
        entity_name: entity,
        user_name: input(body, 'user_name'),
        po_descs: flattenNewlines(body.po_descs),
        supplier_name: input(body, 'supplier_name'),
        po_doc_no: input(body, 'po_doc_no'),
        curr_cd: input(body, 'curr_cd'),
        total_amt: numberFormat(body.total_amt),
        ref_no: input(body, 'ref_no'),
        attachments: urls.map((url, i) => ({ url, file_name: files[i] ?? '' })),
        doc_links: explode(body.document_link, '; '),
        approve_list: approverList(body.approve_exist),
        clarify_user: input(body, 'clarify_user'),
        clarify_email: input(body, 'clarify_email'),
        sender_name: input(body, 'sender'),
        sender_addr: input(body, 'sender_addr'),
      },
      cacheFolder: 'send_pos',
      cacheKeys: [body.approve_seq, body.entity_cd, body.doc_no, body.level_no],
      logLabel: TEXT,
      docNo: body.doc_no,
      entityCd: body.entity_cd,
    });
    return poOutcomeText(this.approval, outcome, 'Failed to send email: ');
  }

  /** GET /api/poselection/:status/:encrypt — passcheckwithremark2 posts to /api/pos/getaccess. */
  confirm(status: string, encrypt: string): Promise<string> {
    return this.approval.confirmationPage({
      status,
      encrypt,
      form: { action: 'api/pos/getaccess' },
    });
  }

  /** POST /api/poselection/getaccess and /api/pos/getaccess — PurchaseSelectionController@getaccess. */
  getAccess(body: RequestInput): Promise<string> {
    const status = input(body, 'status') ?? '';
    const data = this.approval.crypt.decrypt<LinkData>(input(body, 'encrypt') ?? '');

    // PHP: DateTime::createFromFormat('Y-m-d H:i:s', rtrim(trx_date, '.'))->format('d-m-Y').
    const trxDate = parseDate(String(data.trx_date ?? '').replace(/\.+$/, ''));
    if (!trxDate) throw new Error(`Invalid trx_date "${String(data.trx_date)}" for ${TEXT} ${data.doc_no}`);

    return this.approval.runAction({
      status,
      docNo: data.doc_no,
      text: TEXT,
      procedure: 'mgr.x_send_mail_approval_po_selection',
      args: [
        data.entity_cd,
        data.project_no,
        data.doc_no,
        data.request_no,
        // ISO 'YYYYMMDD' converts to the DATETIME parameter regardless of the session DATEFORMAT
        // (PHP sent 'd-m-Y', which fails or swaps day/month under an mdy login).
        trxDate.format('YYYYMMDD'),
        status,
        data.level_no,
        data.usergroup,
        data.user_id,
        data.supervisor,
        normalizeReason(body.reason, '0'),
      ],
    });
  }
}
