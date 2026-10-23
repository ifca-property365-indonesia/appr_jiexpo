import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { now } from '../helpers/format.helper';
import { documentFor, TransactionLog } from './transaction-log.service';

describe('documentFor', () => {
  it.each([
    ['/api/cmentry', undefined, 'CMEntry'],
    ['/api/cmentry/A/82wfk44Hgi', undefined, 'CMEntry'],
    ['/api/landmap/getaccess', undefined, 'LandMap'],
    ['/api/maildata', { module: 'CbRpb' }, 'CbRpb'],
    ['/api/getaccess', { module: 'PoOrder' }, 'PoOrder'],
    ['/api/processdata/CbFupd/A/82wfk44Hgi', undefined, 'CbFupd'],
    ['/api/autosend', undefined, 'AutoSend'],
    ['/apprlist/data', undefined, 'ApprList'],
    ['/', undefined, 'System'],
  ])('%s → %s', (path, body, expected) => {
    expect(documentFor(path, body)).toBe(expected);
  });
});

describe('TransactionLog', () => {
  let dir: string;
  beforeEach(async () => (dir = await mkdtemp(join(tmpdir(), 'txlog-'))));
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('writes ordered JSON lines to <DDMMYYYY>/<document>.log with the request context', async () => {
    const log = new TransactionLog({ get: () => dir } as never);
    log.run({ request_id: 'r1', document: 'CMEntry' }, () => {
      for (let i = 0; i < 20; i++) log.info('sp.exec', { i, procedure: 'mgr.x' });
      log.error('mail.failed', { error: new Error('SMTP down') });
    });
    await new Promise((r) => setTimeout(r, 200));

    const day = join(dir, 'logs', 'transactions', now('DDMMYYYY'));
    expect(await readdir(day)).toEqual(['CMEntry.log']);
    const lines = (await readFile(join(day, 'CMEntry.log'), 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines).toHaveLength(21);
    expect(lines.slice(0, 20).map((l) => l.i)).toEqual([...Array(20).keys()]);
    expect(lines[20]).toMatchObject({
      level: 'error',
      event: 'mail.failed',
      request_id: 'r1',
      error: 'SMTP down',
    });
  });
});
