import { Module } from '@nestjs/common';
import {
  PlBudgetLymanController,
  PlBudgetRevisionController,
  PlFeedbackController,
  PlOverwriteController,
} from './pl.controller';
import { PlBudgetService } from './pl-budget.service';
import { PlFeedbackService } from './pl-feedback.service';
import { PlOverwriteService } from './pl-overwrite.service';

@Module({
  controllers: [
    PlOverwriteController,
    PlBudgetRevisionController,
    PlBudgetLymanController,
    PlFeedbackController,
  ],
  providers: [PlBudgetService, PlOverwriteService, PlFeedbackService],
})
export class PlModule {}
