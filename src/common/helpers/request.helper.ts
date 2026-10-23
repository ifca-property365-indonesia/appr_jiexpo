/** Raw request input (JSON, urlencoded or multipart fields), like Laravel's $request->all(). */
export type RequestInput = Record<string, any>;

/** Laravel `$request->key` semantics: missing → undefined, otherwise the raw value as string. */
export function input(body: RequestInput, key: string): string | undefined {
  const v = body?.[key];
  if (v === undefined || v === null) return undefined;
  return Array.isArray(v) ? String(v[0]) : String(v);
}

/** Lower-cased, trimmed email list value (Laravel strtolower($request->email_addr)). */
export function emailInput(body: RequestInput, key = 'email_addr'): string {
  return (input(body, key) ?? '').trim().toLowerCase();
}
