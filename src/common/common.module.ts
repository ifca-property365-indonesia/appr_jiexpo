import { Global, Module } from '@nestjs/common';
import { ApprovalService } from './approval/approval.service';
import { MailDataRegistry } from './approval/maildata.registry';
import { DatabaseService } from './database/database.service';
import { LinkTokenService } from './links/link-token.service';
import { ChannelLogger } from './logger/channel-logger.service';
import { MailGuardService } from './mail/mail-guard.service';
import { MailService } from './mail/mail.service';
import { ViewService } from './view/view.service';

const providers = [
  ApprovalService,
  ChannelLogger,
  DatabaseService,
  LinkTokenService,
  MailDataRegistry,
  MailGuardService,
  MailService,
  ViewService,
];

@Global()
@Module({ providers, exports: providers })
export class CommonModule {}
