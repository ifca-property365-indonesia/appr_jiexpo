import { Module } from '@nestjs/common';
import { MailDataController } from './maildata.controller';

@Module({ controllers: [MailDataController] })
export class MailDataModule {}
