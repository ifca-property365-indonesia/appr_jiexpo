import { Module } from '@nestjs/common';
import { ApprListController } from './apprlist.controller';
import { ApprListService } from './apprlist.service';

@Module({
  controllers: [ApprListController],
  providers: [ApprListService],
})
export class ApprListModule {}
