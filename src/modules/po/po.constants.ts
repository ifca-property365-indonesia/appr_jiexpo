import type { ApprovalService, SendOutcome } from '../../common/approval/approval.service';

/** ApprovalService.outcomeText() with the module's failure prefix ("Failed to send email: " in some PO controllers). */
export function poOutcomeText(approval: ApprovalService, outcome: SendOutcome, failedPrefix: string): string {
  return outcome.kind === 'failed' ? `${failedPrefix}${outcome.error}` : approval.outcomeText(outcome);
}
