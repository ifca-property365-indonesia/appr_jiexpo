import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { RequestInput } from '../../common/helpers';
import { BUDGET_LYMAN, BUDGET_REVISION, PlBudgetService } from './pl-budget.service';
import {
  FEEDBACK_BUDGET_LYMAN,
  FEEDBACK_BUDGET_REVISION,
  PlFeedbackService,
} from './pl-feedback.service';
import { PlOverwriteService } from './pl-overwrite.service';

@Controller('api/budgetrevision')
export class PlBudgetRevisionController {
  constructor(private readonly service: PlBudgetService) {}

  @Post()
  mail(@Body() body: RequestInput) {
    return this.service.mail(BUDGET_REVISION, body);
  }

  @Post('getaccess')
  update(@Body() body: RequestInput) {
    return this.service.update(BUDGET_REVISION, body);
  }

  @Get(':status/:encrypt')
  confirm(@Param('status') status: string, @Param('encrypt') encrypt: string) {
    return this.service.confirm(BUDGET_REVISION, status, encrypt);
  }
}

/** Not routed in the Laravel app (PLBudgetLymanController) but its email links / form point here. */
@Controller('api/budgetlyman')
export class PlBudgetLymanController {
  constructor(private readonly service: PlBudgetService) {}

  @Post()
  mail(@Body() body: RequestInput) {
    return this.service.mail(BUDGET_LYMAN, body);
  }

  @Post('getaccess')
  update(@Body() body: RequestInput) {
    return this.service.update(BUDGET_LYMAN, body);
  }

  @Get(':status/:encrypt')
  confirm(@Param('status') status: string, @Param('encrypt') encrypt: string) {
    return this.service.confirm(BUDGET_LYMAN, status, encrypt);
  }
}

@Controller('api/ploverwrite')
export class PlOverwriteController {
  constructor(private readonly service: PlOverwriteService) {}

  /** Laravel PlOverwriteController@index; HTTP status = callback Status (200/201/400/500). */
  @Post()
  async index(@Body() body: RequestInput, @Res({ passthrough: true }) res: Response) {
    const callback = await this.service.mail(body);
    res.status(callback.Status);
    return callback;
  }

  @Post('getaccess')
  getAccess(@Body() body: RequestInput) {
    return this.service.getAccess(body);
  }

  @Get(':status/:encrypt')
  confirm(@Param('status') status: string, @Param('encrypt') encrypt: string) {
    return this.service.confirm(status, encrypt);
  }
}

/** Laravel FeedbackPLController — called by mgr.x_send_mail_approval_feedback_pl_budget_lyman / _revision. */
@Controller('api')
export class PlFeedbackController {
  constructor(private readonly service: PlFeedbackService) {}

  @Post('feedbackbudgetlyman')
  feedbackBudgetLyman(@Body() body: RequestInput) {
    return this.service.send(FEEDBACK_BUDGET_LYMAN, body);
  }

  @Post('feedbackbudgetrevision')
  feedbackBudgetRevision(@Body() body: RequestInput) {
    return this.service.send(FEEDBACK_BUDGET_REVISION, body);
  }
}
