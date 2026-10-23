import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ApprovalService } from '../../common/approval/approval.service';
import { MailDataRegistry } from '../../common/approval/maildata.registry';
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

/**
 * CB modules reached through the generic dispatcher (POST /api/maildata module=<module>,
 * GET /api/processdata/<module>/..., POST /api/getaccess). Laravel CbRpbController,
 * CbRumController and CbFupdController only differ by these constants.
 */
export interface CbMailDataDef {
  /** Laravel module name (`<module>Controller`), also used in the email links. */
  module: 'CbRpb' | 'CbRum' | 'CbFupd';
  /** cb_cash_request_appr.TYPE */
  type: 'D' | 'G' | 'E';
  text: string;
  procedure: string;
  cacheFolder: string;
  logLabel: string;
  template: string;
  /** Separator of the url_file / file_name lists (the SPs aggregate them with '; '). */
  fileSeparator: string;
  subject(body: RequestInput): string;
  /** Module-specific email fields. */
  details(body: RequestInput): Record<string, unknown>;
}

export const CB_RPB: CbMailDataDef = {
  module: 'CbRpb',
  type: 'D',
  text: 'Recapitulation Bank',
  procedure: 'mgr.x_send_mail_approval_cb_rpb',
  cacheFolder: 'send_cbrpb',
  logLabel: 'CB RPB',
  template: 'email/cb/rpb',
  fileSeparator: '; ',
  subject: (b) => `Need Approval for Recapitulation Bank No.  ${input(b, 'doc_no') ?? ''}`,
  details: (b) => ({
    rpb_descs: flattenNewlines(b.rpb_descs),
    currency_cd: input(b, 'currency_cd'),
    trx_amt: numberFormat(b.trx_amt),
    hd_doc_no: input(b, 'hd_doc_no'),
  }),
};

export const CB_RUM: CbMailDataDef = {
  module: 'CbRum',
  type: 'G',
  text: 'Cash Advance Settlement',
  procedure: 'mgr.x_send_mail_approval_cb_rum',
  cacheFolder: 'send_cbrum',
  logLabel: 'CB RUM',
  template: 'email/cb/rum',
  fileSeparator: '; ',
  subject: (b) => `Need Approval for Cash Advance Settlement No.  ${input(b, 'doc_no') ?? ''}`,
  details: (b) => ({
    remarks_hd: flattenNewlines(b.remarks_hd),
    currency_cd: input(b, 'currency_cd'),
    total_amt: numberFormat(b.total_amt),
    replenish_doc: input(b, 'replenish_doc'),
  }),
};

export const CB_FUPD: CbMailDataDef = {
  module: 'CbFupd',
  type: 'E',
  text: 'Propose Transfer to Bank',
  procedure: 'mgr.x_send_mail_approval_cb_fupd',
  cacheFolder: 'send_cbfupd',
  logLabel: 'CB FUPD',
  template: 'email/cb/fupd',
  fileSeparator: '; ',
  subject: (b) => `Need Approval for Propose Transfer to Bank No. ${input(b, 'band_hd_no') ?? ''}`,
  details: (b) => ({
    band_hd_descs: flattenNewlines(b.band_hd_descs),
    band_hd_no: input(b, 'band_hd_no'),
    dt_amount: numberFormat(b.dt_amount),
    comm_amt: numberFormat(b.comm_amt),
  }),
};

export const CB_MAILDATA_DEFS = [CB_RPB, CB_RUM, CB_FUPD] as const;

@Injectable()
export class CbMailDataService implements OnModuleInit {
  constructor(
    private readonly approval: ApprovalService,
    private readonly registry: MailDataRegistry,
  ) {}

  onModuleInit(): void {
    for (const def of CB_MAILDATA_DEFS) {
      this.registry.register(def.module, {
        processModule: (body) => this.processModule(def, body),
        update: (status, encrypt, reason) => this.update(def, status, encrypt, reason),
      });
    }
  }

  /** POST /api/maildata module=<def.module> — Laravel <module>Controller@processModule. */
  async processModule(def: CbMailDataDef, body: RequestInput): Promise<string> {
    const entity = entityName(body.entity_name);
    const urls = explode(body.url_file, def.fileSeparator);
    const files = explode(body.file_name, def.fileSeparator);

    const encrypted = this.approval.crypt.encrypt({
      entity_cd: input(body, 'entity_cd'),
      project_no: input(body, 'project_no'),
      doc_no: input(body, 'doc_no'),
      trx_type: input(body, 'trx_type'),
      level_no: input(body, 'level_no'),
      email_address: input(body, 'email_addr'),
      usergroup: input(body, 'usergroup'),
      user_id: input(body, 'user_id'),
      supervisor: input(body, 'supervisor'),
      entity_name: entity,
      type: def.type,
      type_module: 'CB',
      text: def.text,
    });

    const outcome = await this.approval.sendApprovalMail({
      email: emailInput(body),
      subject: def.subject(body),
      template: def.template,
      entityName: entity,
      context: {
        ...def.details(body),
        link: `processdata/${def.module}`,
        encrypt: encrypted,
        entity_name: entity,
        user_name: input(body, 'user_name'),
        attachments: urls.map((url, i) => ({ url, file_name: files[i] ?? '' })),
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
    return this.approval.outcomeText(outcome);
  }

  /** POST /api/getaccess module=<def.module> — Laravel <module>Controller@update. */
  async update(def: CbMailDataDef, status: string, encrypt: string, reason: string): Promise<string> {
    const data = this.approval.crypt.decrypt(encrypt);
    const descs = await this.approval.projectDescs(data.entity_cd, data.project_no);
    return this.approval.runAction({
      status,
      docNo: data.doc_no,
      text: def.text,
      procedure: def.procedure,
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
        reason,
      ],
      entityName: descs,
    });
  }
}
