/**
 * Minimal PHP serialize()/unserialize() for the payloads Laravel's Crypt::encrypt() produces:
 * scalars, null and (nested) arrays. Lengths are in UTF-8 bytes, as in PHP.
 */
export type PhpValue = string | number | boolean | null | PhpValue[] | { [key: string]: PhpValue };

export function phpSerialize(value: unknown): string {
  if (value === null || value === undefined) return 'N;';
  if (typeof value === 'boolean') return `b:${value ? 1 : 0};`;
  if (typeof value === 'number') {
    return Number.isInteger(value) ? `i:${value};` : `d:${value};`;
  }
  if (typeof value === 'string') return `s:${Buffer.byteLength(value, 'utf8')}:"${value}";`;
  if (typeof value === 'object') {
    const entries = Array.isArray(value)
      ? value.map((v, i) => [i, v] as const)
      : Object.entries(value as Record<string, unknown>);
    const body = entries
      .map(([k, v]) => {
        const key = typeof k === 'number' || /^(0|-?[1-9]\d*)$/.test(k) ? `i:${k};` : phpSerialize(k);
        return key + phpSerialize(v);
      })
      .join('');
    return `a:${entries.length}:{${body}}`;
  }
  throw new TypeError(`Cannot PHP-serialize value of type ${typeof value}`);
}

export function phpUnserialize(input: string): PhpValue {
  const buf = Buffer.from(input, 'utf8');
  let pos = 0;

  const readUntil = (ch: string): string => {
    const end = buf.indexOf(ch, pos);
    if (end < 0) throw new SyntaxError(`Unexpected end of serialized data at ${pos}`);
    const s = buf.toString('utf8', pos, end);
    pos = end + 1;
    return s;
  };
  const expect = (ch: string) => {
    if (String.fromCharCode(buf[pos]) !== ch) {
      throw new SyntaxError(`Expected "${ch}" at ${pos}`);
    }
    pos++;
  };

  const parse = (): PhpValue => {
    const type = String.fromCharCode(buf[pos]);
    pos += 2; // type + ':' (or ';' for N)
    switch (type) {
      case 'N':
        return null;
      case 'b':
        return readUntil(';') === '1';
      case 'i':
        return Number.parseInt(readUntil(';'), 10);
      case 'd':
        return Number.parseFloat(readUntil(';'));
      case 's': {
        const len = Number.parseInt(readUntil(':'), 10);
        expect('"');
        const s = buf.toString('utf8', pos, pos + len);
        pos += len;
        expect('"');
        expect(';');
        return s;
      }
      case 'a': {
        const count = Number.parseInt(readUntil(':'), 10);
        expect('{');
        const obj: Record<string, PhpValue> = {};
        let isList = true;
        for (let i = 0; i < count; i++) {
          const key = parse();
          if (key !== i) isList = false;
          obj[String(key)] = parse();
        }
        expect('}');
        return isList ? Object.values(obj) : obj;
      }
      default:
        throw new SyntaxError(`Unsupported serialized type "${type}" at ${pos - 2}`);
    }
  };

  return parse();
}
