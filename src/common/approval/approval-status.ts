export type ApprovalStatus = 'A' | 'R' | 'C';

export interface StatusMeta {
  /** Confirmation page title, e.g. "Approval". */
  name: string;
  /** Confirmation button colour. */
  bgcolor: string;
  /** Confirmation button label, e.g. "Approve". */
  valuebt: string;
  /** Past tense used in result messages, e.g. "Approved". */
  past: string;
  /** Result page image under public/images. */
  image: string;
}

const META: Record<ApprovalStatus, StatusMeta> = {
  A: { name: 'Approval', bgcolor: '#40de1d', valuebt: 'Approve', past: 'Approved', image: 'approved.png' },
  R: { name: 'Revision', bgcolor: '#f4bd0e', valuebt: 'Revise', past: 'Revised', image: 'revise.png' },
  C: { name: 'Cancellation', bgcolor: '#e85347', valuebt: 'Cancel', past: 'Cancelled', image: 'reject.png' },
};

/** Anything other than A / R is treated as Cancel, exactly like the PHP controllers. */
export function statusMeta(status: unknown): StatusMeta {
  return META[status === 'A' || status === 'R' ? status : 'C'];
}

/** Reason sent to the stored procedure; blank input falls back to the module's default. */
export function normalizeReason(reason: unknown, fallback = '0'): string {
  const s = typeof reason === 'string' ? reason.trim() : '';
  return s === '' ? fallback : String(reason);
}
