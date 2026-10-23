import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { RequestInput } from '../../common/helpers';
import { ApprListService } from './apprlist.service';

/** Laravel ApprListControllers (routes/web.php): pending-approval list with "Re-Send Email". */
@Controller()
export class ApprListController {
  constructor(private readonly service: ApprListService) {}

  @Get('appr-list')
  index() {
    return this.service.page();
  }

  /** yajra DataTables server-side endpoint (route name apprlist.getData). */
  @Get('apprlist/data')
  getData(@Query() query: Record<string, unknown>) {
    return this.service.data(query);
  }

  /** Route name apprlist.sendData. */
  @Post('apprlist/sendData')
  async sendData(@Body() body: RequestInput, @Res({ passthrough: true }) res: Response) {
    const reply = await this.service.sendData(body);
    res.status(reply.status);
    return reply.body;
  }
}
