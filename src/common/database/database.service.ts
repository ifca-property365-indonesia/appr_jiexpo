import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sql from 'mssql';
import type { Env } from '../../config/env';

export type SqlParams = Record<string, unknown>;

const SP_NAME = /^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*$/;

/**
 * Thin wrapper over a shared mssql connection pool (Laravel "jiexpo" connection).
 * Queries use named parameters (`@doc_no`) — never interpolate request data into SQL text.
 */
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: sql.ConnectionPool;
  readonly databaseName: string;
  private connecting?: Promise<sql.ConnectionPool>;

  constructor(config: ConfigService<Env, true>) {
    this.pool = new sql.ConnectionPool({
      server: config.get('DB_HOST', { infer: true }),
      port: config.get('DB_PORT', { infer: true }),
      database: config.get('DB_DATABASE', { infer: true }),
      user: config.get('DB_USERNAME', { infer: true }),
      password: config.get('DB_PASSWORD', { infer: true }),
      pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
      requestTimeout: 120_000,
      options: {
        encrypt: config.get('DB_ENCRYPT', { infer: true }),
        trustServerCertificate: config.get('DB_TRUST_SERVER_CERTIFICATE', { infer: true }),
        enableArithAbort: true,
      },
    });
    this.databaseName = config.get('DB_DATABASE', { infer: true });
    this.pool.on('error', (err: Error) => this.logger.error(`SQL pool error: ${err.message}`));
  }

  private async connection(): Promise<sql.ConnectionPool> {
    if (this.pool.connected) return this.pool;
    this.connecting ??= this.pool.connect().finally(() => (this.connecting = undefined));
    return this.connecting;
  }

  private async request(params: SqlParams = {}): Promise<sql.Request> {
    const req = (await this.connection()).request();
    for (const [name, value] of Object.entries(params)) bind(req, name, value);
    return req;
  }

  /** Rows of the first recordset. */
  async query<T = Record<string, any>>(text: string, params?: SqlParams): Promise<T[]> {
    const result = await (await this.request(params)).query<T>(text);
    return result.recordset ?? [];
  }

  async first<T = Record<string, any>>(text: string, params?: SqlParams): Promise<T | undefined> {
    return (await this.query<T>(text, params))[0];
  }

  /** First column of the first row (Laravel ->value()). */
  async value<T = unknown>(text: string, params?: SqlParams): Promise<T | undefined> {
    const row = await this.first<Record<string, T>>(text, params);
    return row ? Object.values(row)[0] : undefined;
  }

  async exists(text: string, params?: SqlParams): Promise<boolean> {
    const row = await this.first(`SELECT CASE WHEN EXISTS (${text}) THEN 1 ELSE 0 END AS e`, params);
    return row?.e === 1;
  }

  /**
   * `SET NOCOUNT ON; EXEC <sp> @p0, @p1, ...` with positional values (PDO-style).
   * Returns every recordset the procedure produced.
   */
  async exec(procedure: string, args: unknown[]): Promise<Record<string, any>[][]> {
    if (!SP_NAME.test(procedure)) throw new Error(`Invalid stored procedure name: ${procedure}`);
    const params = Object.fromEntries(args.map((v, i) => [`p${i}`, v]));
    const placeholders = args.map((_, i) => `@p${i}`).join(', ');
    const result = await (await this.request(params)).query(
      `SET NOCOUNT ON; EXEC ${procedure} ${placeholders};`,
    );
    return (result.recordsets as Record<string, any>[][] | undefined) ?? [];
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.pool.connected) await this.pool.close();
  }
}

/** Mirrors pdo_sqlsrv binding: strings as NVARCHAR, numbers as INT/FLOAT, null as NULL. */
function bind(req: sql.Request, name: string, value: unknown): void {
  if (value === undefined || value === null) req.input(name, sql.NVarChar, null);
  else if (typeof value === 'number') req.input(name, Number.isInteger(value) ? sql.Int : sql.Float, value);
  else if (value instanceof Date) req.input(name, sql.DateTime, value);
  else if (Array.isArray(value)) throw new Error(`Array parameter "${name}" — use inParams()`);
  else req.input(name, sql.NVarChar, String(value));
}

/**
 * Expands an array into named parameters for `IN (...)`:
 * `const { sql: list, params } = inParams('st', ['A','R'])` → `@st0, @st1`.
 */
export function inParams(prefix: string, values: readonly unknown[]): { sql: string; params: SqlParams } {
  const params = Object.fromEntries(values.map((v, i) => [`${prefix}${i}`, v]));
  return { sql: Object.keys(params).map((k) => `@${k}`).join(', '), params };
}
