import { Global, Module } from '@nestjs/common';
import { ApprovalService } from './approval/approval.service';
import { MailDataRegistry } from './approval/maildata.registry';
import { LaravelCryptService } from './crypto/laravel-crypt.service';
import { DatabaseService } from './database/database.service';
import { ChannelLogger } from './logger/channel-logger.service';
import { MailGuardService } from './mail/mail-guard.service';
import { MailService } from './mail/mail.service';
import { ViewService } from './view/view.service';

const providers = [
  ApprovalService,
  ChannelLogger,
  DatabaseService,
  LaravelCryptService,
  MailDataRegistry,
  MailGuardService,
  MailService,
  ViewService,
];

@Global()
@Module({ providers, exports: providers })
export class CommonModule {}
