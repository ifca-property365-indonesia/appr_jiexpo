import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { InvalidLinkException } from '../crypto/laravel-crypt.service';
import { ApprovalService } from '../approval/approval.service';

/**
 * An approval link / form with a broken or tampered token renders the normal result page
 * (Laravel showed a DecryptException error page) instead of a JSON error.
 */
@Catch(InvalidLinkException)
export class InvalidLinkFilter implements ExceptionFilter {
  constructor(private readonly approval: ApprovalService) {}

  catch(exception: InvalidLinkException, host: ArgumentsHost): void {
    this.approval.log.warning('app', `Invalid approval link: ${exception.message}`);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(400)
      .type('html')
      .send(
        this.approval.resultPage({
          Pesan: 'This approval link is invalid or has been modified. Please use the link from the original email.',
          St: 'FAIL',
          notif: 'Invalid link !',
          image: 'reject.png',
        }),
      );
  }
}
