import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { RequestInput } from '../../common/helpers';
import {
  CM_CLOSE,
  CM_DONE,
  CM_ENTRY,
  CM_PROGRESS,
  CM_PROGRESS_WU,
  CONTRACT_RENEW,
  CmService,
  VARIAN_ORDER,
} from './cm.service';

@Controller('api/cmdone')
export class CmDoneController {
  constructor(private readonly service: CmService) {}

  @Post()
  mail(@Body() body: RequestInput) {
    return this.service.mail(CM_DONE, body);
  }

  @Post('getaccess')
  update(@Body() body: RequestInput) {
    return this.service.update(CM_DONE, body);
  }

  @Get(':status/:encrypt')
  confirm(@Param('status') status: string, @Param('encrypt') encrypt: string) {
    return this.service.confirm(CM_DONE, status, encrypt);
  }
}

@Controller('api/cmprogress')
export class CmProgressController {
  constructor(private readonly service: CmService) {}

  @Post()
  mail(@Body() body: RequestInput) {
    return this.service.mail(CM_PROGRESS, body);
  }

  @Post('getaccess')
  update(@Body() body: RequestInput) {
    return this.service.update(CM_PROGRESS, body);
  }

  @Get(':status/:encrypt')
  confirm(@Param('status') status: string, @Param('encrypt') encrypt: string) {
    return this.service.confirm(CM_PROGRESS, status, encrypt);
  }
}

@Controller('api/cmprogresswu')
export class CmProgresswuController {
  constructor(private readonly service: CmService) {}

  /** Answers with the JSON callback; HTTP status = callback Status (200/201/400/500). */
  @Post()
  async mail(@Body() body: RequestInput, @Res({ passthrough: true }) res: Response) {
    const callback = await this.service.mailJson(CM_PROGRESS_WU, body);
    res.status(callback.Status);
    return callback;
  }

  @Post('getaccess')
  update(@Body() body: RequestInput) {
    return this.service.update(CM_PROGRESS_WU, body);
  }

  @Get(':status/:encrypt')
  confirm(@Param('status') status: string, @Param('encrypt') encrypt: string) {
    return this.service.confirm(CM_PROGRESS_WU, status, encrypt);
  }
}

@Controller('api/cmentry')
export class CmEntryController {
  constructor(private readonly service: CmService) {}

  @Post()
  mail(@Body() body: RequestInput) {
    return this.service.mail(CM_ENTRY, body);
  }

  @Post('getaccess')
  update(@Body() body: RequestInput) {
    return this.service.update(CM_ENTRY, body);
  }

  @Get(':status/:encrypt')
  confirm(@Param('status') status: string, @Param('encrypt') encrypt: string) {
    return this.service.confirm(CM_ENTRY, status, encrypt);
  }
}

@Controller('api/cmclose')
export class CmCloseController {
  constructor(private readonly service: CmService) {}

  @Post()
  mail(@Body() body: RequestInput) {
    return this.service.mail(CM_CLOSE, body);
  }

  @Post('getaccess')
  update(@Body() body: RequestInput) {
    return this.service.update(CM_CLOSE, body);
  }

  @Get(':status/:encrypt')
  confirm(@Param('status') status: string, @Param('encrypt') encrypt: string) {
    return this.service.confirm(CM_CLOSE, status, encrypt);
  }
}

@Controller('api/varianorder')
export class VarianOrderController {
  constructor(private readonly service: CmService) {}

  @Post()
  mail(@Body() body: RequestInput) {
    return this.service.mail(VARIAN_ORDER, body);
  }

  @Post('getaccess')
  update(@Body() body: RequestInput) {
    return this.service.update(VARIAN_ORDER, body);
  }

  @Get(':status/:encrypt')
  confirm(@Param('status') status: string, @Param('encrypt') encrypt: string) {
    return this.service.confirm(VARIAN_ORDER, status, encrypt);
  }
}

@Controller('api/contractrenew')
export class ContractRenewController {
  constructor(private readonly service: CmService) {}

  @Post()
  mail(@Body() body: RequestInput) {
    return this.service.mail(CONTRACT_RENEW, body);
  }

  @Post('getaccess')
  update(@Body() body: RequestInput) {
    return this.service.update(CONTRACT_RENEW, body);
  }

  @Get(':status/:encrypt')
  confirm(@Param('status') status: string, @Param('encrypt') encrypt: string) {
    return this.service.confirm(CONTRACT_RENEW, status, encrypt);
  }
}
