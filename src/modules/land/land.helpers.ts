import {
  approverList,
  entityName,
  explode,
  formatDate,
  now,
  numberFormat,
  pairAttachments,
  type RequestInput,
} from '../../common/helpers';

/**
 * Laravel `$request->key` as it ends up in the JSON callback: the raw value, `null` when missing
 * (the shared `input()` helper returns undefined, which JSON.stringify would drop).
 */
export function raw(body: RequestInput, key: string): unknown {
  return body?.[key] ?? null;
}

/** Scalar request value as string; null / undefined → ''. */
export function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value);
  return JSON.stringify(value) ?? '';
}

/** `Carbon::parse($v)->format('d F Y')` — Carbon parses null / '' as "now". */
export function carbonDate(value: unknown): string {
  const s = str(value).trim();
  return s === '' ? now('DD MMMM YYYY') : formatDate(s, 'DD MMMM YYYY');
}

/** `number_format($v, $decimals, '.', ',')` (non-numeric input → 0, PHP threw a TypeError instead). */
export function phpNumber(value: unknown, decimals = 2): string {
  return numberFormat(value, decimals);
}

/** `explode($separator, $request->key)` as a plain list. */
export function list(body: RequestInput, key: string, separator = '; '): string[] {
  return explode(body?.[key], separator);
}

/**
 * The `strToArray()` closure declared inside LandHandoverLegal / LandSplitShgb:
 * empty or "EMPTY" → [], array → as is, otherwise explode(';') + trim.
 */
export function strToArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value === null || value === undefined || value === '' || value === '0' || value === 0)
    return [];
  const s = str(value);
  if (s.toUpperCase() === 'EMPTY') return [];
  return s.split(';').map((v) => v.trim());
}

/**
 * Fields shared by every Land approval `$dataArray` (order as in the PHP controllers).
 * `clarify_*` default to the sender, like most Land controllers.
 */
export function landBase(body: RequestInput): Record<string, unknown> {
  return {
    user_id: raw(body, 'user_id'),
    level_no: raw(body, 'level_no'),
    entity_cd: raw(body, 'entity_cd'),
    doc_no: raw(body, 'doc_no'),
    approve_seq: raw(body, 'approve_seq'),
    email_addr: raw(body, 'email_addr'),
    user_name: raw(body, 'user_name'),
    sender_addr: raw(body, 'sender_addr'),
    sender_name: raw(body, 'sender_name'),
    entity_name: entityName(body.entity_name),
    attachments: pairAttachments(body.url_link, body.file_name),
    descs: raw(body, 'descs'),
    approve_list: approverList(body.approve_exist),
    transaction_date: carbonDate(body.transaction_date),
    clarify_user: raw(body, 'sender_name'),
    clarify_email: raw(body, 'sender_addr'),
  };
}

/** Removes keys a particular controller did not put in its `$dataArray`. */
export function omit<T extends Record<string, unknown>>(obj: T, ...keys: string[]): T {
  const copy = { ...obj };
  for (const k of keys) delete copy[k];
  return copy;
}

/** `[label, value]` row for partials/detail-table (PHP printed null as ''). */
export function row(label: string, value: unknown): [string, string] {
  return [label, str(value)];
}

/** Value at index or '' (Blade `$arr[$i] ?? ''`). */
export function at(values: unknown, i: number): string {
  return str(Array.isArray(values) ? values[i] : undefined);
}
