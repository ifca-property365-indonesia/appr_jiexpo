import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { RequestInput } from '../../common/helpers';
import { PurchaseSelectionService } from './purchase-selection.service';

/** Laravel routes: /purchase_selection, /poselection/{status}/{encrypt}, /poselection/getaccess, /pos/getaccess. */
@Controller('api')
export class PurchaseSelectionController {
  constructor(private readonly service: PurchaseSelectionService) {}

  @Post('purchase_selection')
  mail(@Body() body: RequestInput) {
    return this.service.mail(body);
  }

  @Post(['poselection/getaccess', 'pos/getaccess'])
  getAccess(@Body() body: RequestInput) {
    return this.service.getAccess(body);
  }

  @Get('poselection/:status/:encrypt')
  confirm(@Param('status') status: string, @Param('encrypt') encrypt: string) {
    return this.service.confirm(status, encrypt);
  }
}
