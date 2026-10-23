import { Injectable } from '@nestjs/common';
import { ApprovalService } from '../../common/approval/approval.service';
import { normalizeReason } from '../../common/approval/approval-status';
import {
  approverList,
  emailInput,
  entityName,
  explode,
  flattenNewlines,
  input,
  numberFormat,
  type RequestInput,
} from '../../common/helpers';

/** Payment Request (PPU) variants — same payload/flow, different type code, SP and route. */
export interface PpuVariant {
  /** Route segment and email link, e.g. 'cbppu'. */
  link: string;
  /** cb_cash_request_appr.TYPE */
  type: 'U' | 'V';
  procedure: string;
  cacheFolder: string;
  logLabel: string;
}

export const PPU: PpuVariant = {
  link: 'cbppu',
  type: 'U',
  procedure: 'mgr.x_send_mail_approval_cb_ppu',
  cacheFolder: 'send_cbppu',
  logLabel: 'CB PPU',
};

export const PPU_VVIP: PpuVariant = {
  link: 'cbppuvvip',
  type: 'V',
  procedure: 'mgr.x_send_mail_approval_cb_ppu_vvip',
  cacheFolder: 'send_cbppuvvip',
  logLabel: 'CB PPU VVIP',
};

const TEXT = 'Payment Request';

@Injectable()
export class CbPpuService {
  constructor(private readonly approval: ApprovalService) {}

  /** POST /api/<link> — Laravel CbPpuController@Mail. */
  async mail(variant: PpuVariant, body: RequestInput): Promise<string> {
    const docNo = input(body, 'ppu_no');
    const entity = entityName(body.entity_name);
    // The SP aggregates attachments with '; ' (Laravel split on ',', which broke multi-attachment mails).
    const urls = explode(body.url_file, '; ');
    const files = explode(body.file_name, '; ');

    const encrypted = await this.approval.links.issue({
      entity_cd: input(body, 'entity_cd'),
      project_no: input(body, 'project_no'),
      doc_no: input(body, 'doc_no'),
      trx_type: input(body, 'trx_type'),
      level_no: input(body, 'level_no'),
      usergroup: input(body, 'usergroup'),
      user_id: input(body, 'user_id'),
      supervisor: input(body, 'supervisor'),
      email_address: input(body, 'email_addr'),
      entity_name: entity,
      type: variant.type,
      type_module: 'CB',
      text: TEXT,
    });

    const outcome = await this.approval.sendApprovalMail({
      email: emailInput(body),
      subject: `Need Approval for ${TEXT} No.  ${docNo}`,
      template: 'email/cb/ppu',
      entityName: entity,
      context: {
        link: variant.link,
        encrypt: encrypted,
        entity_name: entity,
        user_name: input(body, 'user_name'),
        ppu_descs: flattenNewlines(body.ppu_descs),
        pay_to: input(body, 'pay_to'),
        forex: input(body, 'forex'),
        ppu_amt: numberFormat(body.ppu_amt),
        ppu_no: docNo,
        attachments: urls.map((url, i) => ({ url, file_name: files[i] ?? '' })),
        doc_link: input(body, 'document_link'),
        approve_list: approverList(body.approve_exist),
        clarify_user: input(body, 'clarify_user'),
        clarify_email: input(body, 'clarify_email'),
        sender_name: input(body, 'sender'),
        sender_addr: input(body, 'sender_addr'),
      },
      cacheFolder: variant.cacheFolder,
      cacheKeys: [body.approve_seq, body.entity_cd, body.doc_no, body.level_no],
      logLabel: variant.logLabel,
      docNo: body.doc_no,
      entityCd: body.entity_cd,
    });
    return this.approval.outcomeText(outcome);
  }

  /** GET /api/<link>/:status/:encrypt */
  confirm(variant: PpuVariant, status: string, encrypt: string): Promise<string> {
    return this.approval.confirmationPage({
      status,
      encrypt,
      form: { action: `api/${variant.link}/getaccess` },
    });
  }

  /** POST /api/<link>/getaccess */
  async getAccess(variant: PpuVariant, body: RequestInput): Promise<string> {
    const status = input(body, 'status') ?? '';
    const data = await this.approval.links.resolve(input(body, 'encrypt') ?? '');
    const descs = await this.approval.projectDescs(data.entity_cd, data.project_no);
    return this.approval.runAction({
      status,
      docNo: data.doc_no,
      text: TEXT,
      procedure: variant.procedure,
      args: [
        data.entity_cd,
        data.project_no,
        data.doc_no,
        data.trx_type,
        status,
        data.level_no,
        data.usergroup,
        data.user_id,
        data.supervisor,
        normalizeReason(body.reason, '0'),
      ],
      entityName: descs,
    });
  }
}
