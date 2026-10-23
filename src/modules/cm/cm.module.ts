import { Module } from '@nestjs/common';
import {
  CmCloseController,
  CmDoneController,
  CmEntryController,
  CmProgressController,
  CmProgresswuController,
  ContractRenewController,
  VarianOrderController,
} from './cm.controller';
import { CmService } from './cm.service';

@Module({
  controllers: [
    CmDoneController,
    CmProgressController,
    CmProgresswuController,
    CmEntryController,
    CmCloseController,
    VarianOrderController,
    ContractRenewController,
  ],
  providers: [CmService],
})
export class CmModule {}
