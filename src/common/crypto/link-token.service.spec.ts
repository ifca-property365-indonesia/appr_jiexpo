import { InvalidLinkException, LaravelCryptService } from './laravel-crypt.service';
import { LinkTokenService } from './link-token.service';

const crypt = new LaravelCryptService({ get: () => 'base64:w20CZQOb5dTFPDTwS1M664bshrofag3Jah+BODAIVKg=' } as never);

/** In-memory stand-in for mgr.approval_link. */
function fakeDb(collisions = 0) {
  const rows = new Map<string, string>();
  let fail = collisions;
  return {
    rows,
    query: jest.fn((_sql: string, p: { token: string; payload: string }) => {
      if (fail-- > 0 || rows.has(p.token)) return Promise.reject(Object.assign(new Error('dup'), { number: 2627 }));
      rows.set(p.token, p.payload);
      return Promise.resolve([]);
    }),
    value: jest.fn((_sql: string, p: { token: string }) => Promise.resolve(rows.get(p.token))),
  };
}

describe('LinkTokenService', () => {
  const payload = { doc_no: 'PK001', entity_cd: '01', level_no: '1', text: 'Payment Request' };

  it('issues a 10-char base62 token whose stored payload stays encrypted', async () => {
    const db = fakeDb();
    const links = new LinkTokenService(crypt, db as never);
    const token = await links.issue(payload);
    expect(token).toMatch(/^[0-9A-Za-z]{10}$/);
    expect(db.rows.get(token)).not.toContain('PK001');
    expect(await links.resolve(token)).toEqual(payload);
  });

  it('retries on a primary-key collision', async () => {
    const db = fakeDb(2);
    const token = await new LinkTokenService(crypt, db as never).issue(payload);
    expect(db.query).toHaveBeenCalledTimes(3);
    expect(db.rows.has(token)).toBe(true);
  });

  it('still resolves legacy long tokens without touching the database', async () => {
    const db = fakeDb();
    const legacy = crypt.encrypt(payload);
    expect(await new LinkTokenService(crypt, db as never).resolve(legacy)).toEqual(payload);
    expect(db.value).not.toHaveBeenCalled();
  });

  it('rejects unknown short tokens', async () => {
    await expect(new LinkTokenService(crypt, fakeDb() as never).resolve('82wfk44Hgi')).rejects.toBeInstanceOf(
      InvalidLinkException,
    );
  });
});
