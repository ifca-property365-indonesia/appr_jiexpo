import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApprovalService } from '../../common/approval/approval.service';
import { MailDataRegistry } from '../../common/approval/maildata.registry';
import { input, type RequestInput } from '../../common/helpers';

/** Generic dispatcher (Laravel MailDataController) for CbFupd, CbRpb, CbRum, PoOrder, PoRequest. */
@Controller('api')
export class MailDataController {
  constructor(
    private readonly registry: MailDataRegistry,
    private readonly approval: ApprovalService,
  ) {}

  @Post('maildata')
  receive(@Body() body: RequestInput) {
    return this.registry.get(body.module).processModule(body);
  }

  @Get('processdata/:module/:status/:encrypt')
  processData(
    @Param('module') module: string,
    @Param('status') status: string,
    @Param('encrypt') encrypt: string,
  ) {
    return this.approval.confirmationPage({
      status,
      encrypt,
      form: (data) => ({
        action: 'api/getaccess',
        module,
        // PO Request level 1 lets the approver add a comment on approval too.
        reasonOnApprove:
          data.type === 'Q' && data.type_module === 'PO' && String(data.level_no) === '1'
            ? 'comment'
            : 'none',
      }),
    });
  }

  @Post('getaccess')
  async getAccess(@Body() body: RequestInput) {
    try {
      return await this.registry
        .get(body.module)
        .update(input(body, 'status') ?? '', input(body, 'encrypt') ?? '', input(body, 'reason') || 'no note');
    } catch (err) {
      this.approval.log.error('app', `Error in getAccess method: ${(err as Error).message}`);
      return this.approval.resultPage({ Pesan: (err as Error).message, image: 'reject.png' });
    }
  }
}
