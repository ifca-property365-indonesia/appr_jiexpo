import dayjs from 'dayjs';

/**
 * Helpers for raw rows of mgr.cb_cash_request_appr (shared by the jobs and apprlist modules).
 *
 * - Column names keep the database casing (the PHP code reads `$row->TYPE` but `$row->module`),
 *   so `col()` looks them up case-insensitively.
 * - mssql returns DATETIME values as JS Dates whose UTC fields hold the stored wall-clock time
 *   (driver default useUTC = true); `sqlDateTime()` / `formatSqlDate()` read them back without a
 *   timezone shift, giving the same text pdo_sqlsrv returned to Laravel.
 */
export type SqlRow = Record<string, any>;

export function col(row: SqlRow | undefined, name: string): any {
  if (!row) return undefined;
  if (name in row) return row[name];
  const key = Object.keys(row).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : row[key];
}

/** Trimmed string value of a column ('' when null). */
export function colStr(row: SqlRow | undefined, name: string): string {
  const v = col(row, name);
  return v === null || v === undefined ? '' : String(v).trim();
}

/** Date → 'YYYY-MM-DD HH:mm:ss.SSS' (pdo_sqlsrv string format); other values unchanged. */
export function sqlDateTime(value: unknown): unknown {
  return value instanceof Date ? value.toISOString().replace('T', ' ').replace('Z', '') : value;
}

/** Formats a DB date value with dayjs tokens; '' when empty / unparsable. */
export function formatSqlDate(value: unknown, pattern: string): string {
  if (value === null || value === undefined || value === '') return '';
  const d = value instanceof Date ? dayjs(value.toISOString().replace('Z', '')) : dayjs(String(value));
  return d.isValid() ? d.format(pattern) : '';
}

/** Row with every Date column rendered as pdo_sqlsrv text (JSON output for the browser). */
export function serializeRow(row: SqlRow): SqlRow {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, sqlDateTime(v)]));
}

/** Laravel `str_replace(' ', '', $entity_cd) . '01'`. */
export function defaultProjectNo(entityCd: unknown): string {
  return `${String(entityCd ?? '').replaceAll(' ', '')}01`;
}

/** PDO binds every positional value as a string; null stays NULL. */
export function pdoArgs(args: unknown[]): unknown[] {
  return args.map((v) => (v === null || v === undefined ? null : String(v)));
}
