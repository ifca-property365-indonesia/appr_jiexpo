import { Module } from '@nestjs/common';
import { definitionController } from './definition-approval.controller';
import { DefinitionApprovalService } from './definition-approval.service';
import {
  AGENT_DEACTIVE,
  SALES_BOOKING_DISC,
  SALES_BOOKING_PACKAGE,
  SALES_CHANGE_NAME,
  SALES_DEACTIVE,
  SALES_LOT,
  SALES_LOT_ACTIVITY,
  SALES_LOT_TEMP,
} from './sales.definitions';

/** Sales approvals: /api/{agentdeactive,salesbookingdisc,salesbookingpackage,saleschangename,salesdeactive,saleslot,saleslotactivity,lottemp}. */
@Module({
  controllers: [
    definitionController(AGENT_DEACTIVE, 'AgentDeactiveController'),
    definitionController(SALES_BOOKING_DISC, 'SalesBookingDiscController'),
    definitionController(SALES_BOOKING_PACKAGE, 'SalesBookingPackageController'),
    definitionController(SALES_CHANGE_NAME, 'SalesChangeNameController'),
    definitionController(SALES_DEACTIVE, 'SalesDeactiveController'),
    definitionController(SALES_LOT, 'SalesLotController'),
    definitionController(SALES_LOT_ACTIVITY, 'SalesLotActivityController'),
    definitionController(SALES_LOT_TEMP, 'LotTempController'),
  ],
  providers: [DefinitionApprovalService],
})
export class SalesModule {}
