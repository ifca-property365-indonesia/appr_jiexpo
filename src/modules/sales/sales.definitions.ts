import { input, pairAttachments, type RequestInput } from '../../common/helpers';
import {
  opt,
  optDate,
  urlAttachments,
  type ApprovalDefinition,
  type DetailRow,
} from './definition-approval.service';

/**
 * Sales approvals (mgr.cb_cash_request_appr module 'SA'). Each entry mirrors one stored procedure:
 * `link` = URL suffix the SP posts to, request keys = the SP's JSON body, `args` = the SP parameter order.
 */

const TEMPLATE = 'email/sales/approval';

/** Payment-plan / agent deactivation: (entity_cd, doc_no, payment_cd, status, level_no, remarks). */
const deactiveArgs: ApprovalDefinition['args'] = (d, status, reason) => [
  d.entity_cd,
  d.doc_no,
  d.payment_cd,
  status,
  d.level_no,
  reason,
];

/** Booking discount / package: (entity_cd, project_no, doc_no, lot_no, status, level_no, userid, remarks). */
const bookingArgs: ApprovalDefinition['args'] = (d, status, reason) => [
  d.entity_cd,
  d.project_no,
  d.doc_no,
  d.lot_no,
  status,
  d.level_no,
  d.user_id,
  reason,
];

/** Lot / lot temporary: (entity_cd, project_no, doc_no, status, level_no, grp_name, userid, remarks). */
const lotArgs: ApprovalDefinition['args'] = (d, status, reason) => [
  d.entity_cd,
  d.project_no,
  d.doc_no,
  status,
  d.level_no,
  d.grp_name,
  d.user_id,
  reason,
];

const bookingRows = (b: RequestInput): DetailRow[] => [
  ['Document No.', opt(b, 'doc_no')],
  ['Project No.', opt(b, 'project_no')],
  ['Lot No.', opt(b, 'lot_no')],
  ['Sales Date', optDate(b, 'transaction_date')],
];

export const AGENT_DEACTIVE: ApprovalDefinition = {
  link: 'agentdeactive',
  label: 'Agent Deactivation',
  type: 'B',
  module: 'SA',
  procedure: 'mgr.xrl_send_mail_approval_sales_agent_deactive',
  template: TEMPLATE,
  cacheFolder: 'send_agentdeactive',
  logLabel: 'Agent Deactive',
  remarks: true,
  payload: (b) => ({ payment_cd: input(b, 'payment_code') }),
  args: deactiveArgs,
  rows: (b) => [
    ['Deactivation No.', opt(b, 'doc_no')],
    [
      'Agent',
      [opt(b, 'payment_code'), opt(b, 'agent_name')].filter(Boolean).join(' - ') || undefined,
    ],
    ['Deactivation Date', optDate(b, 'transaction_date')],
    ['Reason', opt(b, 'plan_descs')],
    ['Reference No.', opt(b, 'ref_no')],
  ],
};

export const SALES_DEACTIVE: ApprovalDefinition = {
  link: 'salesdeactive',
  label: 'Payment Plan Deactivation',
  type: 'A',
  module: 'SA',
  procedure: 'mgr.xrl_send_mail_approval_sales_deactive',
  template: TEMPLATE,
  cacheFolder: 'send_salesdeactive',
  logLabel: 'Sales Deactive',
  remarks: true,
  payload: (b) => ({ payment_cd: input(b, 'payment_code') }),
  args: deactiveArgs,
  rows: (b) => [
    ['Deactivation No.', opt(b, 'doc_no')],
    ['Payment Plan', opt(b, 'payment_code')],
    ['Deactivation Date', optDate(b, 'transaction_date')],
    ['Reason', opt(b, 'plan_descs')],
    ['Reference No.', opt(b, 'ref_no')],
  ],
};

export const SALES_BOOKING_DISC: ApprovalDefinition = {
  link: 'salesbookingdisc',
  label: 'Booking Special Discount',
  type: 'I',
  module: 'SA',
  procedure: 'mgr.xrl_send_mail_approval_sales_booking_disc',
  template: TEMPLATE,
  cacheFolder: 'send_salesbookingdisc',
  logLabel: 'Sales Booking Disc',
  remarks: true,
  payload: (b) => ({ project_no: input(b, 'project_no'), lot_no: input(b, 'lot_no') }),
  args: bookingArgs,
  rows: bookingRows,
};

export const SALES_BOOKING_PACKAGE: ApprovalDefinition = {
  ...SALES_BOOKING_DISC,
  link: 'salesbookingpackage',
  label: 'Booking Package',
  type: 'J',
  procedure: 'mgr.xrl_send_mail_approval_sales_booking_package',
  cacheFolder: 'send_salesbookingpackage',
  logLabel: 'Sales Booking Package',
};

export const SALES_CHANGE_NAME: ApprovalDefinition = {
  link: 'saleschangename',
  label: 'Change Name',
  type: 'D',
  module: 'SA',
  procedure: 'mgr.xrl_send_mail_approval_sales_change_name',
  template: TEMPLATE,
  cacheFolder: 'send_saleschangename',
  logLabel: 'Sales Change Name',
  remarks: true,
  payload: (b) => ({
    project_no: input(b, 'project_no'),
    lot_no: input(b, 'lot_no'),
    grp_name: input(b, 'rt_grp_name'),
  }),
  // (entity_cd, project_no, doc_no, lot_no, status, level_no, grp_name, userid, remarks)
  args: (d, status, reason) => [
    d.entity_cd,
    d.project_no,
    d.doc_no,
    d.lot_no,
    status,
    d.level_no,
    d.grp_name,
    d.user_id,
    reason,
  ],
  rows: (b) => [
    ['Document No.', opt(b, 'doc_no')],
    ['Lot No.', opt(b, 'lot_no')],
    ['Current Name', opt(b, 'old_name')],
    ['New Name', opt(b, 'new_name')],
    ['Reason', opt(b, 'reason_descs')],
    ['Remarks', opt(b, 'remarks')],
    ['Request Date', optDate(b, 'transaction_date')],
  ],
};

export const SALES_LOT: ApprovalDefinition = {
  link: 'saleslot',
  label: 'Sales Lot',
  type: 'H',
  module: 'SA',
  procedure: 'mgr.xrl_send_mail_approval_sales_lot',
  template: TEMPLATE,
  cacheFolder: 'send_saleslot',
  logLabel: 'Sales Lot',
  remarks: true,
  payload: (b) => ({ project_no: input(b, 'project_no'), grp_name: input(b, 'rt_grp_name') }),
  args: lotArgs,
  rows: (b) => [
    ['Document No.', opt(b, 'doc_no')],
    ['Prospect No.', opt(b, 'prospect_no')],
    ['Previous Lot No.', opt(b, 'lot_no_old')],
    ['New Lot No.', opt(b, 'lot_no')],
    ['Land Area', opt(b, 'land_area')],
    ['Document Date', optDate(b, 'transaction_date')],
  ],
  attachments: (b) => urlAttachments(b.url_link),
};

export const SALES_LOT_TEMP: ApprovalDefinition = {
  link: 'lottemp',
  label: 'Lot Temporary',
  type: 'G',
  module: 'SA',
  procedure: 'mgr.xrl_send_mail_approval_sales_lot_temp',
  template: TEMPLATE,
  cacheFolder: 'send_lottemp',
  logLabel: 'Lot Temp',
  remarks: true,
  payload: (b) => ({ project_no: input(b, 'project_no'), grp_name: input(b, 'rt_grp_name') }),
  args: lotArgs,
  rows: (b) => [
    ['Document No.', opt(b, 'doc_no')],
    ['Prospect No.', opt(b, 'prospect_no')],
    ['Lot No.', opt(b, 'lot_no_hd')],
    ['Temporary Lot No.', opt(b, 'lot_no_dt')],
    ['Land Area', opt(b, 'land_area')],
    ['Document Date', optDate(b, 'transaction_date')],
  ],
  attachments: (b) => urlAttachments(b.url_link),
};

export const SALES_LOT_ACTIVITY: ApprovalDefinition = {
  link: 'saleslotactivity',
  label: 'Lot Activity',
  type: 'N',
  module: 'SA',
  procedure: 'mgr.xrl_send_mail_approval_sales_lot_activity',
  template: TEMPLATE,
  cacheFolder: 'send_saleslotactivity',
  logLabel: 'Sales Lot Activity',
  remarks: true,
  payload: (b) => ({ project_no: input(b, 'project_no') }),
  // (entity_cd, project_no, doc_no, status, level_no, userid, remarks)
  args: (d, status, reason) => [
    d.entity_cd,
    d.project_no,
    d.doc_no,
    status,
    d.level_no,
    d.user_id,
    reason,
  ],
  rows: (b) => [
    ['Document No.', opt(b, 'doc_no')],
    ['Lot No.', opt(b, 'lot_no')],
    [
      'Activity',
      [opt(b, 'activity_cd'), opt(b, 'activity_type')].filter(Boolean).join(' / ') || undefined,
    ],
    ['Reference No.', opt(b, 'ref_no')],
    ['Activity Date', optDate(b, 'transaction_date')],
  ],
  attachments: (b) => pairAttachments(b.url_file, b.file_name),
};
