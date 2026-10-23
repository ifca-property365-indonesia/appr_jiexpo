import { input } from '../../common/helpers';
import { opt, optDate, type ApprovalDefinition } from '../sales/definition-approval.service';

/** Tenancy approvals (mgr.cb_cash_request_appr module 'TM'). */
export const CONTRACT_TERMINATE: ApprovalDefinition = {
  link: 'contractterminate',
  label: 'Contract Termination',
  type: 'T',
  module: 'TM',
  procedure: 'mgr.xrl_send_mail_approval_tm_contract_terminate',
  template: 'email/tm/contract-terminate',
  cacheFolder: 'send_contractterminate',
  logLabel: 'Contract Terminate',
  remarks: true,
  // doc_date is ISO 8601 (SP style 126) and is passed back unchanged to the DATETIME parameter
  payload: (b) => ({ project_no: input(b, 'project_no'), doc_date: input(b, 'doc_date') }),
  // (entity_cd, project_no, doc_no, doc_date, status, level_no, userid, remarks)
  args: (d, status, reason) => [
    d.entity_cd,
    d.project_no,
    d.doc_no,
    d.doc_date,
    status,
    d.level_no,
    d.user_id,
    reason,
  ],
  rows: (b) => [
    ['Tenant No.', opt(b, 'doc_no')],
    ['Tenant Name', opt(b, 'tenant_name')],
    ['Termination Date', optDate(b, 'transaction_date')],
    ['Remarks', opt(b, 'remarks_web')],
  ],
};
