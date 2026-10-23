import { InvalidLinkException, LinkTokenService } from './link-token.service';

/** In-memory stand-in for mgr.approval_link. */
function fakeDb(collisions = 0) {
  const rows = new Map<string, string>();
  let fail = collisions;
  return {
    rows,
    query: jest.fn((_sql: string, p: { token: string; payload: string }) => {
      if (fail-- > 0 || rows.has(p.token))
        return Promise.reject(Object.assign(new Error('dup'), { number: 2627 }));
      rows.set(p.token, p.payload);
      return Promise.resolve([]);
    }),
    value: jest.fn((_sql: string, p: { token: string }) => Promise.resolve(rows.get(p.token))),
  };
}

describe('LinkTokenService', () => {
  const payload = { doc_no: 'PK001', entity_cd: '01', level_no: '1', text: 'Payment Request' };

  it('issues a 10-char base62 token and resolves it back to the payload', async () => {
    const db = fakeDb();
    const links = new LinkTokenService(db as never);
    const token = await links.issue(payload);
    expect(token).toMatch(/^[0-9A-Za-z]{10}$/);
    expect(JSON.parse(db.rows.get(token)!)).toEqual(payload);
    expect(await links.resolve(token)).toEqual(payload);
  });

  it('retries on a primary-key collision', async () => {
    const db = fakeDb(2);
    const token = await new LinkTokenService(db as never).issue(payload);
    expect(db.query).toHaveBeenCalledTimes(3);
    expect(db.rows.has(token)).toBe(true);
  });

  it('rejects malformed tokens without querying the database', async () => {
    const db = fakeDb();
    const links = new LinkTokenService(db as never);
    for (const bad of ['', 'short', 'eyJpdiI6InEvNUhvaVd5', "82wfk44Hg'"]) {
      await expect(links.resolve(bad)).rejects.toBeInstanceOf(InvalidLinkException);
    }
    expect(db.value).not.toHaveBeenCalled();
  });

  it('rejects unknown tokens', async () => {
    await expect(
      new LinkTokenService(fakeDb() as never).resolve('82wfk44Hgi'),
    ).rejects.toBeInstanceOf(InvalidLinkException);
  });
});
