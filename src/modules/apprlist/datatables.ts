/**
 * Minimal server-side DataTables (yajra/laravel-datatables) request/response contract:
 * draw, start, length, search[value], order[i][column|dir], columns[i][data|searchable|orderable|search][value]
 * → { draw, recordsTotal, recordsFiltered, data }.
 */
export interface DtColumn {
  data: string;
  searchable: boolean;
  orderable: boolean;
  search: string;
}

export interface DtRequest {
  draw: number;
  start: number;
  /** -1 = all rows. */
  length: number;
  search: string;
  order: { column: number; dir: 'ASC' | 'DESC' }[];
  columns: DtColumn[];
}

export interface DtResponse<T> {
  draw: number;
  recordsTotal: number;
  recordsFiltered: number;
  data: T[];
}

/**
 * Express 5's default "simple" query parser leaves `columns[0][data]` as a flat key; nested objects
 * appear only with the "extended" parser. This accepts both shapes.
 */
function unflatten(query: Record<string, unknown>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(query)) {
    const path = key.split(/\]\[|\[|\]/).filter((p) => p !== '');
    let node = out;
    path.forEach((part, i) => {
      if (i === path.length - 1) {
        node[part] = node[part] && typeof node[part] === 'object' && typeof value === 'object'
          ? { ...node[part], ...(value as object) }
          : value;
      } else {
        node[part] ??= {};
        node = node[part];
      }
    });
  }
  return out;
}

const first = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : v == null ? '' : String(v));
const int = (v: unknown, fallback: number) => {
  const n = Number.parseInt(first(v), 10);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (v: unknown) => first(v) !== 'false';
/** Index-preserving list from {"0": …, "3": …} or an array (holes become undefined). */
const entries = (v: unknown): any[] => {
  if (!v || typeof v !== 'object') return [];
  const out: any[] = [];
  for (const [k, item] of Object.entries(v)) if (/^\d+$/.test(k)) out[Number(k)] = item;
  return Array.from(out);
};

export function parseDtRequest(query: Record<string, unknown>): DtRequest {
  const q = unflatten(query);
  const length = int(q.length, 10);
  return {
    draw: int(q.draw, 0),
    start: Math.max(0, int(q.start, 0)),
    length: length < 0 ? -1 : Math.min(length, 1000) || 10,
    search: first(q.search?.value).trim(),
    order: entries(q.order).map((o) => ({
      column: int(o?.column, -1),
      dir: first(o?.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC',
    })),
    columns: entries(q.columns).map((c) => ({
      data: first(c?.data),
      searchable: bool(c?.searchable),
      orderable: bool(c?.orderable),
      search: first(c?.search?.value).trim(),
    })),
  };
}

/** Escapes LIKE wildcards for SQL Server and wraps the term in %…%. */
export function likeContains(term: string): string {
  return `%${term.replace(/[[%_]/g, (ch) => `[${ch}]`)}%`;
}
