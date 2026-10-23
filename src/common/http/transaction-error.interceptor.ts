import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, type Observable, throwError } from 'rxjs';
import { InvalidLinkException } from '../links/link-token.service';
import { TransactionLog } from '../logger/transaction-log.service';

/** Records why a request failed (the http.request line only carries the status code). */
@Injectable()
export class TransactionErrorInterceptor implements NestInterceptor {
  constructor(private readonly tx: TransactionLog) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err: unknown) => {
        // invalid links are logged by InvalidLinkFilter
        if (!(err instanceof InvalidLinkException)) {
          const status = err instanceof HttpException ? err.getStatus() : 500;
          this.tx.log(status >= 500 ? 'error' : 'warning', 'http.error', {
            http_status: status,
            error: err,
          });
        }
        return throwError(() => err);
      }),
    );
  }
}
