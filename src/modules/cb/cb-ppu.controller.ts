import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { RequestInput } from '../../common/helpers';
import { CbPpuService, PPU, PPU_VVIP } from './cb-ppu.service';

@Controller('api/cbppu')
export class CbPpuController {
  constructor(private readonly service: CbPpuService) {}

  @Post()
  mail(@Body() body: RequestInput) {
    return this.service.mail(PPU, body);
  }

  @Post('getaccess')
  getAccess(@Body() body: RequestInput) {
    return this.service.getAccess(PPU, body);
  }

  @Get(':status/:encrypt')
  confirm(@Param('status') status: string, @Param('encrypt') encrypt: string) {
    return this.service.confirm(PPU, status, encrypt);
  }
}

/** Not routed in the Laravel app (dead controller) but its email links point here. */
@Controller('api/cbppuvvip')
export class CbPpuVvipController {
  constructor(private readonly service: CbPpuService) {}

  @Post()
  mail(@Body() body: RequestInput) {
    return this.service.mail(PPU_VVIP, body);
  }

  @Post('getaccess')
  getAccess(@Body() body: RequestInput) {
    return this.service.getAccess(PPU_VVIP, body);
  }

  @Get(':status/:encrypt')
  confirm(@Param('status') status: string, @Param('encrypt') encrypt: string) {
    return this.service.confirm(PPU_VVIP, status, encrypt);
  }
}
