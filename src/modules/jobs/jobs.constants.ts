/**
 * Stored-procedure whitelists for the cron jobs (only names from these tables are ever executed).
 */

/** AutoSendController $spMap: module → TYPE → approval-mail SP. */
export const AUTO_SEND_SP: Record<string, Record<string, string>> = {
  CB: {
    U: 'mgr.x_send_mail_approval_cb_ppu',
    V: 'mgr.x_send_mail_approval_cb_ppu_vvip',
    D: 'mgr.x_send_mail_approval_cb_rpb',
    E: 'mgr.x_send_mail_approval_cb_fupd',
    G: 'mgr.x_send_mail_approval_cb_rum',
  },
  PO: {
    A: 'mgr.x_send_mail_approval_po_order',
    Q: 'mgr.x_send_mail_approval_po_request',
  },
  LM: {
    F: 'mgr.xrl_send_mail_approval_land_fph',
    M: 'mgr.xrl_send_mail_approval_land_handover_legal',
    H: 'mgr.xrl_send_mail_approval_land_handover_shgb',
    B: 'mgr.xrl_send_mail_approval_land_map',
    K: 'mgr.xrl_send_mail_approval_land_measuring',
    A: 'mgr.xrl_send_mail_approval_land_measuring_sft',
    R: 'mgr.xrl_send_mail_approval_land_request',
    W: 'mgr.xrl_send_mail_approval_land_request_legal',
    T: 'mgr.xrl_send_mail_approval_land_sertifikat',
    Y: 'mgr.xrl_send_mail_approval_land_sft_bphtb',
    J: 'mgr.xrl_send_mail_approval_land_sft_merge_shgb',
    X: 'mgr.xrl_send_mail_approval_land_sft_propose',
    Z: 'mgr.xrl_send_mail_approval_land_sft_shgb',
    S: 'mgr.xrl_send_mail_approval_land_sph',
    Q: 'mgr.xrl_send_mail_approval_land_split_shgb',
    E: 'mgr.xrl_send_mail_approval_land_submission',
    V: 'mgr.xrl_send_mail_approval_land_verification',
    '2': 'mgr.xrl_send_mail_approval_land_verification_payment',
  },
  CM: {
    E: 'mgr.xrl_send_mail_approval_cm_contract_entry',
    C: 'mgr.xrl_send_mail_approval_cm_contractclose',
    B: 'mgr.xrl_send_mail_approval_cm_contractdone',
    A: 'mgr.xrl_send_mail_approval_cm_progress',
    D: 'mgr.xrl_send_mail_approval_cm_varianorder',
  },
};

/** AutoSendTestController if/else chain (10-arg SPs; PO S / PO Q use their own fixed SPs). */
export const AUTO_SEND_TEST_SP: Record<string, Record<string, string>> = {
  CB: {
    U: 'mgr.x_send_mail_approval_cb_ppu',
    V: 'mgr.x_send_mail_approval_cb_ppu_vvip',
    D: 'mgr.x_send_mail_approval_cb_rpb',
    G: 'mgr.x_send_mail_approval_cb_rum',
  },
  CM: {
    E: 'mgr.xrl_send_mail_approval_cm_contract_entry',
    A: 'mgr.xrl_send_mail_approval_cm_progress',
    C: 'mgr.xrl_send_mail_approval_cm_contractclose',
    B: 'mgr.xrl_send_mail_approval_cm_contractdone',
    D: 'mgr.xrl_send_mail_approval_cm_varianorder',
  },
  PL: {
    B: 'mgr.xrl_send_mail_approval_pl_budget_lyman',
    R: 'mgr.xrl_send_mail_approval_pl_budget_revision',
  },
  PO: {
    A: 'mgr.x_send_mail_approval_po_order',
  },
};
export const PO_SELECTION_SP = 'mgr.x_send_mail_approval_po_selection';
export const PO_REQUEST_SP = 'mgr.x_send_mail_approval_po_request';

/** Feedback SP definition (AutoFeedback / CheckFeedback / OldFeedback). */
export interface FeedbackDef {
  /** descsLong argument. */
  label: string;
  procedure: string;
  /** mail_cache folder written by the matching /api/feedback_* endpoint. */
  folder: string;
}

/**
 * module → TYPE → feedback SP. The PHP chains test `D && CB` twice; the second branch
 * (Cash Advance Settlement / mgr.x_send_mail_approval_feedback_cb_rum) is unreachable and is omitted.
 */
export const FEEDBACK_DEFS: Record<string, Record<string, FeedbackDef>> = {
  CB: {
    E: { label: 'Propose Transfer to Bank', procedure: 'mgr.x_send_mail_approval_feedback_cb_fupd', folder: 'feedbackCbFupd' },
    U: { label: 'Payment Request', procedure: 'mgr.x_send_mail_approval_feedback_cb_ppu', folder: 'feedbackCb' },
    V: { label: 'Payment Request', procedure: 'mgr.x_send_mail_approval_feedback_cb_ppu_vvip', folder: 'feedbackCb' },
    D: { label: 'Recapitulation Bank', procedure: 'mgr.x_send_mail_approval_feedback_cb_rpb', folder: 'feedbackCb' },
  },
  PO: {
    A: { label: 'Purchase Order', procedure: 'mgr.x_send_mail_approval_feedback_po_order', folder: 'feedbackPoOrder' },
    Q: { label: 'Purchase Requisition', procedure: 'mgr.x_send_mail_approval_feedback_po_request', folder: 'feedbackPOR' },
    S: { label: 'Purchase Selection', procedure: 'mgr.x_send_mail_approval_feedback_po_selection', folder: 'feedbackPOS' },
  },
  CM: {
    A: { label: 'Contract Progress', procedure: 'mgr.x_send_mail_approval_feedback', folder: 'feedbackCb' },
    B: { label: 'Contract Complete', procedure: 'mgr.x_send_mail_approval_feedback', folder: 'feedbackCb' },
    C: { label: 'Contract Close', procedure: 'mgr.x_send_mail_approval_feedback', folder: 'feedbackCb' },
    D: { label: 'Varian Order', procedure: 'mgr.x_send_mail_approval_feedback', folder: 'feedbackCb' },
    E: { label: 'Contract Entry', procedure: 'mgr.x_send_mail_approval_feedback', folder: 'feedbackCb' },
  },
};

/** OldFeedbackController only knew the CB and PO feedbacks. */
export const OLD_FEEDBACK_MODULES = ['CB', 'PO'];
/** OldFeedbackController hard-coded `$day = '16'` (re-run for one past day of the current month). */
export const OLD_FEEDBACK_DEFAULT_DAY = '16';

export const FEEDBACK_DESCS = '(APPROVED)';
export const FEEDBACK_MARKER_PREFIX = 'email_feedback_sent';
