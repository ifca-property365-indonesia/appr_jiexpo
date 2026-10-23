import { Controller, Get, Query } from '@nestjs/common';
import { JobsService } from './jobs.service';

/** Cron-triggered batch jobs (external scheduler calls these via HTTP GET). */
@Controller('api')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  /** Laravel AutoSendController@index */
  @Get('autosend')
  autoSend() {
    return this.jobs.autoSend();
  }

  /** Laravel AutoSendTestController@index (dry run) */
  @Get('autosendtest')
  autoSendTest() {
    return this.jobs.autoSendTest();
  }

  /** Laravel AutoFeedbackController@index */
  @Get('autofeedback')
  autoFeedback() {
    return this.jobs.autoFeedback();
  }

  /** Laravel CheckFeedbackController@index (read-only) */
  @Get('checkfeedback')
  checkFeedback() {
    return this.jobs.checkFeedback();
  }

  /** Laravel OldFeedbackController@index */
  @Get('oldfeedback')
  oldFeedback(@Query('day') day?: string) {
    return this.jobs.oldFeedback(day);
  }
}
