import { Module } from '@nestjs/common';
import { PoMailDataService } from './po-maildata.service';
import { PurchaseSelectionController } from './purchase-selection.controller';
import { PurchaseSelectionService } from './purchase-selection.service';

@Module({
  controllers: [PurchaseSelectionController],
  // PoMailDataService registers PoOrder / PoRequest in the MailDataRegistry (/api/maildata, /api/getaccess).
  providers: [PurchaseSelectionService, PoMailDataService],
})
export class PoModule {}
