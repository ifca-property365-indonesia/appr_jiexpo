import { Module } from '@nestjs/common';
import { CbMailDataService } from './cb-maildata.service';
import { CbPpuController, CbPpuVvipController } from './cb-ppu.controller';
import { CbPpuService } from './cb-ppu.service';

@Module({
  controllers: [CbPpuController, CbPpuVvipController],
  // CbMailDataService registers CbRpb / CbRum / CbFupd in the MailDataRegistry (/api/maildata, /api/getaccess).
  providers: [CbPpuService, CbMailDataService],
})
export class CbModule {}
