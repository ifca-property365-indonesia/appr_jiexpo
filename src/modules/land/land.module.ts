import { Module } from '@nestjs/common';
import { LandApprovalService } from './land-approval.service';
import { LAND_CONTROLLERS } from './land.controller';
import { LandFeedbackService } from './land-feedback.service';
import { LandSubmissionService } from './land-submission.service';

/** Land group: 21 Land* approval modules (one definition table), LandSubmission and the Land feedback mails. */
@Module({
  controllers: LAND_CONTROLLERS,
  providers: [LandApprovalService, LandFeedbackService, LandSubmissionService],
})
export class LandModule {}
