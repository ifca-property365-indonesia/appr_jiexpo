import { randomInt } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const TOKEN_LENGTH = 10;
const TOKEN = new RegExp(`^[0-9A-Za-z]{${TOKEN_LENGTH}}$`);
/** SQL Server duplicate key errors (PK collision on a random token). */
const DUPLICATE_KEY = new Set([2627, 2601]);

/** Malformed or unknown approval-link token. */
export class InvalidLinkException extends BadRequestException {}

/**
 * Approval-link tokens (e.g. `82wfk44Hgi`).
 *
 * `issue()` stores the link data (doc_no, entity_cd, level_no, type, ...) as JSON in mgr.approval_link under a
 * random 10-char base62 token (~59 bits, crypto RNG — not guessable or enumerable). Only the token travels in the
 * email; `resolve()` looks it up again when the approver clicks.
 */
@Injectable()
export class LinkTokenService {
  constructor(private readonly db: DatabaseService) {}

  async issue(payload: Record<string, unknown>): Promise<string> {
    const json = JSON.stringify(payload);
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = randomToken();
      try {
        await this.db.query('INSERT INTO mgr.approval_link (token, payload) VALUES (@token, @payload)', {
          token,
          payload: json,
        });
        return token;
      } catch (err) {
        if (!DUPLICATE_KEY.has((err as { number?: number }).number ?? -1)) throw err;
      }
    }
    throw new Error('Could not allocate a unique approval link token');
  }

  async resolve<T = Record<string, any>>(token: string): Promise<T> {
    if (!TOKEN.test(token ?? '')) throw new InvalidLinkException('Malformed approval link.');
    const json = await this.db.value<string>('SELECT payload FROM mgr.approval_link WHERE token = @token', { token });
    if (!json) throw new InvalidLinkException('Unknown approval link.');
    return JSON.parse(json) as T;
  }
}

function randomToken(): string {
  let token = '';
  for (let i = 0; i < TOKEN_LENGTH; i++) token += ALPHABET[randomInt(ALPHABET.length)];
  return token;
}
