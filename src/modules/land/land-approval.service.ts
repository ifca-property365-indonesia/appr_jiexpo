import { Injectable } from '@nestjs/common';
import { ApprovalService } from '../../common/approval/approval.service';
import { normalizeReason } from '../../common/approval/approval-status';
import { emailInput, entityName, input, type RequestInput } from '../../common/helpers';
import { LAND_KEY_FIELDS, standardEncrypt, type LandDefinition } from './land.definitions';

/**
 * Generic Land approval flow (Laravel Land*Controller index / processData / getaccess),
 * driven by {@link LandDefinition}.
 */
@Injectable()
export class LandApprovalService {
  constructor(private readonly approval: ApprovalService) {}

  /**
   * POST /api/<link> → JSON callback { data: { encrypted }, Error, Pesan, Status }.
   * The approval SP only reads $.Status, $.Error and $.data.encrypted (stored by azure_ins).
   */
  async mail(def: LandDefinition, body: RequestInput) {
    let data: { encrypted: string } | null = null;
    try {
      const payload = def.payload(body);
      const encrypted = this.approval.crypt.encrypt((def.encrypt ?? standardEncrypt)(body, def));
      data = { encrypted };

      const outcome = await this.approval.sendApprovalMail({
        email: emailInput(body),
        subject: String(payload.subject),
        template: 'email/land/approval',
        entityName: entityName(body.entity_name),
        context: { ...payload, ...def.view(payload), link: def.link, encrypt: encrypted },
        cacheFolder: def.cacheFolder,
        cacheKeys: [body.approve_seq, body.entity_cd, body.doc_no, body.level_no],
        logLabel: def.text,
        docNo: body.doc_no,
        entityCd: body.entity_cd,
      });
      return this.approval.outcomeCallback(outcome, data);
    } catch (err) {
      // Building the payload failed (PHP: Carbon / number_format exceptions inside the try).
      const error = (err as Error).message;
      this.approval.log.error('sendmail', `Gagal mengirim email: ${error}`);
      return this.approval.outcomeCallback({ kind: 'failed', error }, data);
    }
  }

  /** GET /api/<link>/:status/:encrypt — remark/passcheckwithremark (hidden "no reason" on approve). */
  confirm(def: LandDefinition, status: string, encrypt: string): Promise<string> {
    return this.approval.confirmationPage({
      status,
      encrypt,
      keyFields: [...LAND_KEY_FIELDS],
      form: { action: `api/${def.link}/getaccess`, reasonOnApprove: 'hidden' },
    });
  }

  /** POST /api/<link>/getaccess */
  getAccess(def: LandDefinition, body: RequestInput): Promise<string> {
    const status = input(body, 'status') ?? '';
    const data = this.approval.crypt.decrypt(input(body, 'encrypt') ?? '');
    const levelNo = def.levelNoAsInt
      ? Number.parseInt(String(data.level_no ?? ''), 10) || 0
      : data.level_no;
    const args = def.args
      ? def.args(data, status, body)
      : [data.entity_cd, data.doc_no, status, levelNo, normalizeReason(body.reason, 'no reason')];
    return this.approval.runAction({
      status,
      docNo: data.doc_no,
      text: def.text,
      procedure: def.procedure,
      args,
      // PHP: entityName($request->entity_name) — the confirmation form does not post it.
      entityName: body.entity_name,
    });
  }
}
