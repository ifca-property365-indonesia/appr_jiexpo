import { Body, Controller, Post } from '@nestjs/common';
import type { RequestInput } from '../../common/helpers';
import { FEEDBACK_CB, FEEDBACK_CB_FUPD, FEEDBACK_CM_PROGRESS, FEEDBACK_PO, StaffService } from './staff.service';

/** Laravel StaffFeedbackController. */
@Controller('api')
export class StaffFeedbackController {
  constructor(private readonly service: StaffService) {}

  @Post('feedback_po')
  feedbackPo(@Body() body: RequestInput) {
    return this.service.staffAction(FEEDBACK_PO, body);
  }

  @Post('feedback_cb_fupd')
  feedbackCbFupd(@Body() body: RequestInput) {
    return this.service.staffAction(FEEDBACK_CB_FUPD, body);
  }

  @Post('feedback_cb')
  feedbackCb(@Body() body: RequestInput) {
    return this.service.staffAction(FEEDBACK_CB, body);
  }

  @Post('feedback_cm_progress')
  feedbackCmProgress(@Body() body: RequestInput) {
    return this.service.staffAction(FEEDBACK_CM_PROGRESS, body);
  }
}
