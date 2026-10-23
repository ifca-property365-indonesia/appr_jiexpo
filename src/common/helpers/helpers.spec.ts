import { DEFAULT_ENTITY_NAME, entityName } from './entity.helper';
import { formatDate, numberFormat, safeDateFormat, safeNumber } from './format.helper';
import { cleanList, flattenNewlines, pairAttachments } from './list.helper';

describe('entityName', () => {
  it.each([undefined, null, '', '   '])('falls back to the default for %p', (v) => {
    expect(entityName(v)).toBe(DEFAULT_ENTITY_NAME);
  });
  it('keeps a given name', () => expect(entityName(' PT A ')).toBe('PT A'));
});

describe('format helpers', () => {
  it('numberFormat mirrors PHP number_format(v, 2, ".", ",")', () => {
    expect(numberFormat('1234567.5')).toBe('1,234,567.50');
    expect(numberFormat('')).toBe('0.00');
    expect(numberFormat(12.345, 0)).toBe('12');
  });

  it('safeNumber / safeDateFormat return "" for blank and EMPTY', () => {
    expect(safeNumber('EMPTY')).toBe('');
    expect(safeNumber('abc')).toBe('');
    expect(safeDateFormat('')).toBe('');
    expect(safeDateFormat('2025-01-05 00:00:00.000')).toBe('05 January 2025');
  });

  it('parses SQL Server default datetime strings', () => {
    expect(formatDate('Jan  5 2025 12:00AM', 'YYYYMMDD')).toBe('20250105');
    expect(formatDate('2025-02-03', 'DD-MM-YYYY')).toBe('03-02-2025');
  });
});

describe('list helpers', () => {
  it('pairAttachments keeps positional pairs where both sides are filled', () => {
    expect(pairAttachments('u1; EMPTY ;u3', 'f1;f2;')).toEqual([{ url: 'u1', file_name: 'f1' }]);
  });
  it('cleanList drops blank and EMPTY', () => {
    expect(cleanList('a; ;EMPTY;b')).toEqual(['a', 'b']);
  });
  it('flattenNewlines', () => expect(flattenNewlines('a\nb')).toBe('a (b)'));
});
