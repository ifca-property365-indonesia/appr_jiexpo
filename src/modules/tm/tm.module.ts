import { Module } from '@nestjs/common';
import { definitionController } from '../sales/definition-approval.controller';
import { DefinitionApprovalService } from '../sales/definition-approval.service';
import { CONTRACT_TERMINATE } from './tm.definitions';

/** Tenancy approvals: /api/contractterminate (same definition-driven flow as SalesModule). */
@Module({
  controllers: [definitionController(CONTRACT_TERMINATE, 'ContractTerminateController')],
  providers: [DefinitionApprovalService],
})
export class TmModule {}
