import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../../config/env';
import { now } from '../helpers/format.helper';
import { DOCUMENT_BY_MAILDATA_MODULE, DOCUMENT_BY_SEGMENT } from './transaction-documents';

export interface TransactionContext {
  /** Correlates every line written while handling one HTTP request. */
  request_id: string;
  /** Log file name, e.g. CMEntry → storage/logs/transactions/<DDMMYYYY>/CMEntry.log */
  document: string;
  method?: string;
  path?: string;
  ip?: string;
}

export type Level = 'info' | 'warning' | 'error';

/** Request fields copied into the http.request line (never the whole body). */
const SUMMARY_FIELDS = [
  'module',
  'entity_cd',
  'doc_no',
  'level_no',
  'approve_seq',
  'status',
  'email_addr',
  'user_id',
];

/**
 * Structured transaction log: one JSON object per line, one file per document per day
 * (storage/logs/transactions/23102026/CMEntry.log). Records incoming requests, every email sent or skipped,
 * every approval page / action and every stored-procedure call, all tagged with the request_id.
 */
@Injectable()
export class TransactionLog {
  private readonly console = new Logger('Transaction');
  private readonly storage = new AsyncLocalStorage<TransactionContext>();
  private readonly baseDir: string;
  /** Per-file write queue so concurrent lines never interleave. */
  private readonly queues = new Map<string, Promise<void>>();

  constructor(config: ConfigService<Env, true>) {
    this.baseDir = join(config.get('STORAGE_PATH', { infer: true }), 'logs', 'transactions');
  }

  get context(): TransactionContext | undefined {
    return this.storage.getStore();
  }

  /** Runs `fn` with its own context (for work outside an HTTP request). */
  run<T>(context: Partial<TransactionContext>, fn: () => T): T {
    return this.storage.run({ request_id: randomUUID(), document: 'System', ...context }, fn);
  }

  info(event: string, data: Record<string, unknown> = {}): void {
    this.write('info', event, data);
  }

  warning(event: string, data: Record<string, unknown> = {}): void {
    this.write('warning', event, data);
  }

  error(event: string, data: Record<string, unknown> = {}): void {
    this.write('error', event, data);
  }

  /** Express middleware: opens a context per request and logs the response status and duration. */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/public/') || req.path === '/favicon.ico') return next();
      const started = process.hrtime.bigint();
      const context: TransactionContext = {
        request_id: randomUUID(),
        document: documentFor(req.path, req.body as Record<string, unknown> | undefined),
        method: req.method,
        path: req.path,
        ip: req.ip,
      };
      res.setHeader('X-Request-Id', context.request_id);
      this.storage.run(context, () => {
        res.on('finish', () =>
          this.write(res.statusCode >= 500 ? 'error' : 'info', 'http.request', {
            http_status: res.statusCode,
            duration_ms: elapsedMs(started),
            input: summary(req.body),
          }),
        );
        next();
      });
    };
  }

  /** Writes one line at an explicit level (for callers that pick the level at runtime). */
  log(level: Level, event: string, data: Record<string, unknown> = {}): void {
    this.write(level, event, data);
  }

  private write(level: Level, event: string, data: Record<string, unknown>): void {
    const context = this.context ?? { request_id: '-', document: 'System' };
    const line = JSON.stringify(
      { time: now('YYYY-MM-DD HH:mm:ss.SSS'), level, event, ...context, ...data },
      jsonSafe,
    );
    const file = join(this.baseDir, now('DDMMYYYY'), `${safeName(context.document)}.log`);

    const previous = this.queues.get(file) ?? Promise.resolve();
    const next = previous
      .then(() => mkdir(dirname(file), { recursive: true }))
      .then(() => appendFile(file, `${line}\n`))
      .catch((err: Error) => this.console.error(`Cannot write ${file}: ${err.message}`))
      .finally(() => {
        if (this.queues.get(file) === next) this.queues.delete(file);
      });
    this.queues.set(file, next);
  }
}

/** /api/<segment>/... → document name; dispatcher routes use the module they dispatch to. */
export function documentFor(path: string, body?: Record<string, unknown>): string {
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'api') parts.shift();
  const [segment = '', second] = parts;

  if (segment === 'processdata' || segment === 'maildata' || segment === 'getaccess') {
    const module = segment === 'processdata' ? second : body?.module;
    const key = String(module ?? '').toLowerCase();
    return DOCUMENT_BY_MAILDATA_MODULE[key] ?? (key ? String(module) : 'MailData');
  }
  if (segment === 'appr-list' || segment === 'apprlist') return 'ApprList';
  return DOCUMENT_BY_SEGMENT[segment] ?? (segment || 'System');
}

function summary(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const picked = Object.fromEntries(
    SUMMARY_FIELDS.filter((k) => (body as Record<string, unknown>)[k] !== undefined).map((k) => [
      k,
      (body as Record<string, unknown>)[k],
    ]),
  );
  return Object.keys(picked).length ? picked : undefined;
}

export function elapsedMs(started: bigint): number {
  return Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10;
}

function safeName(name: string): string {
  return name.replace(/[^\w-]/g, '') || 'System';
}

/** Errors serialise as their message; long strings are cut so one line stays readable. */
function jsonSafe(_key: string, value: unknown): unknown {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…`;
  return value;
}
