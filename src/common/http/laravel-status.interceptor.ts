import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * Laravel answers every successful request with 200; Nest defaults POST to 201.
 * The ERP and approval forms were built against Laravel, so successful responses default to 200.
 * Handlers that set a status themselves (`res.status(...)` with passthrough) still win.
 */
@Injectable()
export class LaravelStatusInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      context.switchToHttp().getResponse<Response>().status(200);
    }
    return next.handle();
  }
}
