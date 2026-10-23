import { isFilled } from './format.helper';

/** PHP explode() on a possibly-missing value (explode(',', null) → ['']). */
export function explode(value: unknown, separator: string): string[] {
  return String(value ?? '').split(separator);
}

/** explode + trim + drop blank / "EMPTY" items. */
export function cleanList(value: unknown, separator = ';'): string[] {
  return explode(value, separator)
    .map((v) => v.trim())
    .filter(isFilled);
}

export interface Attachment {
  url: string;
  file_name: string;
}

/**
 * Pairs `url_link` and `file_name` lists by original position, skipping blank / EMPTY entries
 * (same pairing rule as the Land controllers: an item is kept only when both sides are filled).
 */
export function pairAttachments(urls: unknown, files: unknown, separator = ';'): Attachment[] {
  const fileList = explode(files, separator).map((f) => f.trim());
  return explode(urls, separator)
    .map((u, i) => ({ url: u.trim(), file_name: fileList[i] ?? '' }))
    .filter((a) => isFilled(a.url) && isFilled(a.file_name));
}

/** "a\nb" → "a (b)" — description flattening used in several email bodies. */
export function flattenNewlines(value: unknown): string {
  const s = String(value ?? '');
  return s.includes('\n') ? `${s.replaceAll('\n', ' (')})` : s;
}

/** Splits the "approve_exist" list sent by the ERP ("name1; name2"). */
export function approverList(value: unknown): string[] {
  return explode(value, '; ');
}
