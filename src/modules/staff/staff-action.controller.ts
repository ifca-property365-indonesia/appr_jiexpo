import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { RequestInput } from '../../common/helpers';
import { STAFF_ACTION, STAFF_ACTION_POS, StaffService } from './staff.service';

/** Laravel StaffActionController (the active one, not StaffActionController_old). */
@Controller('api')
export class StaffActionController {
  constructor(private readonly service: StaffService) {}

  @Post('staffaction')
  staffAction(@Body() body: RequestInput) {
    return this.service.staffAction(STAFF_ACTION, body);
  }

  @Post('staffaction_por')
  staffActionPor(@Body() body: RequestInput) {
    return this.service.staffActionPor(body);
  }

  @Post('staffaction_pos')
  staffActionPos(@Body() body: RequestInput) {
    return this.service.staffAction(STAFF_ACTION_POS, body);
  }

  @Post('fileexist')
  fileExist(@Body() body: RequestInput) {
    return this.service.fileExist(body);
  }

  @Post('feedbackland')
  async feedbackLand(@Body() body: RequestInput, @Res({ passthrough: true }) res: Response) {
    const reply = await this.service.feedbackLand(body);
    res.status(reply.status);
    return reply.body;
  }

  @Post('feedbacklandrequest')
  async feedbackLandRequest(@Body() body: RequestInput, @Res({ passthrough: true }) res: Response) {
    const reply = await this.service.feedbackLandRequest(body);
    res.status(reply.status);
    return reply.body;
  }
}
