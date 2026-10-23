import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Res,
  type Type,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequestInput } from '../../common/helpers';
import { LandApprovalService } from './land-approval.service';
import { LandFeedbackService } from './land-feedback.service';
import { LandSubmissionService } from './land-submission.service';
import {
  LAND_DEFINITIONS,
  LAND_FPH,
  LAND_VERIFICATION,
  type LandDefinition,
} from './land.definitions';

/**
 * Builds the controller of one Land module:
 *   POST /api/<link>                   → index (JSON callback, HTTP status = callback.Status)
 *   GET  /api/<link>/:status/:encrypt  → processData (confirmation page)
 *   POST /api/<link>/getaccess         → getaccess (result page)
 */
export function createLandController(def: LandDefinition) {
  @Controller(`api/${def.link}`)
  class LandController {
    constructor(
      @Inject(LandApprovalService) readonly service: LandApprovalService,
      @Inject(LandFeedbackService) readonly feedbackService: LandFeedbackService,
    ) {}

    @Post()
    async mail(@Body() body: RequestInput, @Res({ passthrough: true }) res: Response) {
      const callback = await this.service.mail(def, body);
      res.status(callback.Status);
      return callback;
    }

    @Post('getaccess')
    @HttpCode(200)
    getAccess(@Body() body: RequestInput) {
      return this.service.getAccess(def, body);
    }

    @Get(':status/:encrypt')
    confirm(@Param('status') status: string, @Param('encrypt') encrypt: string) {
      return this.service.confirm(def, status, encrypt);
    }
  }
  const name = def.link
    .replace(/^land/, 'Land')
    .replace(/^Land(\w)/, (_, c: string) => `Land${c.toUpperCase()}`);
  Object.defineProperty(LandController, 'name', { value: `${name}Controller` });
  return LandController;
}

/** /api/landfph + POST /api/landfph/feedback (feedback_fph). */
@Controller(`api/${LAND_FPH.link}`)
export class LandFphController extends createLandController(LAND_FPH) {
  @Post('feedback')
  async feedback(@Body() body: RequestInput, @Res({ passthrough: true }) res: Response) {
    const callback = await this.feedbackService.feedback(LAND_FPH, body);
    res.status(callback.Status);
    return callback;
  }
}

/** /api/landverification + POST /api/landverification/feedback (feedback_verification). */
@Controller(`api/${LAND_VERIFICATION.link}`)
export class LandVerificationController extends createLandController(LAND_VERIFICATION) {
  @Post('feedback')
  async feedback(@Body() body: RequestInput, @Res({ passthrough: true }) res: Response) {
    const callback = await this.feedbackService.feedback(LAND_VERIFICATION, body);
    res.status(callback.Status);
    return callback;
  }
}

/**
 * POST /api/feedbackSph        (mgr.x_send_mail_approval_feedback_land_sph)
 * POST /api/feedbacksubmission (mgr.x_send_mail_approval_feedback_land_submission)
 */
@Controller('api')
export class LandFeedbackController {
  constructor(private readonly service: LandFeedbackService) {}

  @Post('feedbackSph')
  async feedbackSph(@Body() body: RequestInput, @Res({ passthrough: true }) res: Response) {
    const callback = await this.service.feedbackSph(body);
    res.status(callback.Status);
    return callback;
  }

  @Post('feedbacksubmission')
  async feedbackSubmission(@Body() body: RequestInput, @Res({ passthrough: true }) res: Response) {
    const callback = await this.service.feedbackSubmission(body);
    res.status(callback.Status);
    return callback;
  }
}

/** LandSubmissionController: POST /api/landsubmission, POST /update, GET /:status/:encrypt. */
@Controller('api/landsubmission')
export class LandSubmissionController {
  constructor(private readonly service: LandSubmissionService) {}

  @Post()
  @HttpCode(200)
  mail(@Body() body: RequestInput) {
    return this.service.mail(body);
  }

  @Post('update')
  @HttpCode(200)
  update(@Body() body: RequestInput) {
    return this.service.update(body);
  }

  @Get(':status/:encrypt')
  confirm(@Param('status') status: string, @Param('encrypt') encrypt: string) {
    return this.service.confirm(status, encrypt);
  }
}

/** Every Land controller, in route-registration order. */
export const LAND_CONTROLLERS: Type<unknown>[] = [
  ...LAND_DEFINITIONS.filter((d) => d !== LAND_FPH && d !== LAND_VERIFICATION).map(
    createLandController,
  ),
  LandFphController,
  LandVerificationController,
  LandSubmissionController,
  LandFeedbackController,
];
