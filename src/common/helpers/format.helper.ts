import dayjs, { type Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(customParseFormat);

/** Formats accepted when parsing dates coming from SQL Server / the ERP caller. */
const DATE_INPUT_FORMATS = [
  'YYYY-MM-DD HH:mm:ss.SSS',
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DDTHH:mm:ss.SSSZ',
  'YYYY-MM-DDTHH:mm:ss',
  'YYYY-MM-DD',
  'MMM D YYYY h:mmA', // SQL Server default: "Jan  5 2025 12:00AM" (spaces are normalised first)
  'MMM D YYYY',
  'DD-MM-YYYY HH:mm',
  'DD-MM-YYYY',
  'DD/MM/YYYY',
];

/** True when the value is neither blank nor the ERP placeholder "EMPTY". */
export function isFilled(value: unknown): value is string | number {
  if (value === null || value === undefined) return false;
  const s = String(value).trim();
  return s !== '' && s.toUpperCase() !== 'EMPTY';
}

/** Lenient date parsing (Carbon::parse equivalent for the formats this app receives). */
export function parseDate(value: unknown): Dayjs | null {
  if (value instanceof Date) return dayjs(value);
  if (!isFilled(value)) return null;
  const s = String(value).trim().replace(/\s+/g, ' ');
  const strict = dayjs(s, DATE_INPUT_FORMATS, true);
  if (strict.isValid()) return strict;
  const loose = dayjs(s);
  return loose.isValid() ? loose : null;
}

/**
 * Formats a date with dayjs tokens. Common PHP equivalents:
 * 'd F Y' → 'DD MMMM YYYY', 'd-m-Y H:i' → 'DD-MM-YYYY HH:mm', 'Ymd' → 'YYYYMMDD'.
 * Returns '' when the value cannot be parsed.
 */
export function formatDate(value: unknown, pattern = 'DD MMMM YYYY'): string {
  return parseDate(value)?.format(pattern) ?? '';
}

/** Current time formatted (process TZ is Asia/Jakarta, set in main.ts). */
export function now(pattern: string): string {
  return dayjs().format(pattern);
}

/** Today's folder stamp used by the mail de-duplication cache (PHP date('Ymd')). */
export function todayStamp(): string {
  return now('YYYYMMDD');
}

/** PHP number_format($v, $decimals, '.', ','); non-numeric input is treated as 0. */
export function numberFormat(value: unknown, decimals = 2): string {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').replaceAll(',', ''));
  return (Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** FormatHelper::safeNumber — '' for blank / EMPTY / non-numeric, otherwise number_format(2). */
export function safeNumber(value: unknown, decimals = 2): string {
  if (!isFilled(value) || Number.isNaN(Number(String(value).trim()))) return '';
  return numberFormat(value, decimals);
}

/** FormatHelper::safeDateFormat — '' for blank / EMPTY / unparsable, otherwise 'd F Y'. */
export function safeDateFormat(value: unknown): string {
  return formatDate(value, 'DD MMMM YYYY');
}
