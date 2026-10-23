import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from './common/common.module';
import { InvalidLinkFilter } from './common/http/invalid-link.filter';
import { LaravelStatusInterceptor } from './common/http/laravel-status.interceptor';
import { TransactionErrorInterceptor } from './common/http/transaction-error.interceptor';
import { validateEnv } from './config/env';
import { ApprListModule } from './modules/apprlist/apprlist.module';
import { CbModule } from './modules/cb/cb.module';
import { CmModule } from './modules/cm/cm.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { LandModule } from './modules/land/land.module';
import { MailDataModule } from './modules/maildata/maildata.module';
import { PlModule } from './modules/pl/pl.module';
import { PoModule } from './modules/po/po.module';
import { SalesModule } from './modules/sales/sales.module';
import { StaffModule } from './modules/staff/staff.module';
import { SystemModule } from './modules/system/system.module';
import { TmModule } from './modules/tm/tm.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    CommonModule,
    SystemModule,
    MailDataModule,
    CbModule,
    PoModule,
    CmModule,
    PlModule,
    LandModule,
    StaffModule,
    JobsModule,
    ApprListModule,
    SalesModule,
    TmModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: LaravelStatusInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransactionErrorInterceptor },
    { provide: APP_FILTER, useClass: InvalidLinkFilter },
  ],
})
export class AppModule {}
