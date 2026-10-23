import { Injectable, NotFoundException } from '@nestjs/common';
import type { RequestInput } from '../helpers/request.helper';

/**
 * A module reachable through the generic /api/maildata, /api/processdata/<module>/... and
 * /api/getaccess endpoints (Laravel resolved `App\Http\Controllers\<module>Controller` dynamically).
 */
export interface MailDataHandler {
  /** POST /api/maildata with module=<name>. */
  processModule(body: RequestInput): Promise<unknown>;
  /** POST /api/getaccess with module=<name>; returns the result page HTML. */
  update(status: string, encrypt: string, reason: string): Promise<string>;
}

@Injectable()
export class MailDataRegistry {
  private readonly handlers = new Map<string, MailDataHandler>();

  register(module: string, handler: MailDataHandler): void {
    this.handlers.set(module.toLowerCase(), handler);
  }

  get(module: unknown): MailDataHandler {
    const handler = this.handlers.get(String(module ?? '').toLowerCase());
    if (!handler) throw new NotFoundException(`Unknown module "${String(module)}"`);
    return handler;
  }
}
