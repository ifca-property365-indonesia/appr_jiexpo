import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { InvalidLinkException, LaravelCryptService } from './laravel-crypt.service';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const TOKEN_LENGTH = 10;
const SHORT_TOKEN = new RegExp(`^[0-9A-Za-z]{${TOKEN_LENGTH}}$`);
/** SQL Server duplicate key errors (PK collision on a random token). */
const DUPLICATE_KEY = new Set([2627, 2601]);

/**
 * Short approval-link tokens (e.g. `82wfk44Hgi`) instead of the ~800-char Laravel Crypt payload.
 *
 * `issue()` stores the link data — still encrypted with APP_KEY — in mgr.approval_link and returns a random
 * 10-char base62 id (~59 bits of entropy). `resolve()` accepts both short tokens and the legacy long
 * tokens, so links already sent by the PHP app or older versions of this service keep working.
 */
@Injectable()
export class LinkTokenService {
  constructor(
    private readonly crypt: LaravelCryptService,
    private readonly db: DatabaseService,
  ) {}

  async issue(payload: Record<string, unknown>): Promise<string> {
    const sealed = this.crypt.encrypt(payload);
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = randomToken();
      try {
        await this.db.query('INSERT INTO mgr.approval_link (token, payload) VALUES (@token, @payload)', {
          token,
          payload: sealed,
        });
        return token;
      } catch (err) {
        if (!DUPLICATE_KEY.has((err as { number?: number }).number ?? -1)) throw err;
      }
    }
    throw new Error('Could not allocate a unique approval link token');
  }

  async resolve<T = Record<string, any>>(token: string): Promise<T> {
    if (!SHORT_TOKEN.test(token ?? '')) return this.crypt.decrypt<T>(token); // legacy long token
    const sealed = await this.db.value<string>('SELECT payload FROM mgr.approval_link WHERE token = @token', {
      token,
    });
    if (!sealed) throw new InvalidLinkException('Unknown approval link.');
    return this.crypt.decrypt<T>(sealed);
  }
}

function randomToken(): string {
  let token = '';
  for (let i = 0; i < TOKEN_LENGTH; i++) token += ALPHABET[randomInt(ALPHABET.length)];
  return token;
}
