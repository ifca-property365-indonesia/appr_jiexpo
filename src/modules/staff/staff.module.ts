import { Module } from '@nestjs/common';
import { StaffActionController } from './staff-action.controller';
import { StaffFeedbackController } from './staff-feedback.controller';
import { StaffService } from './staff.service';

@Module({
  controllers: [StaffActionController, StaffFeedbackController],
  providers: [StaffService],
})
export class StaffModule {}
