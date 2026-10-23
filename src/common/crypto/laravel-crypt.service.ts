import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { phpSerialize, phpUnserialize } from './php-serialize';

/** Broken, tampered or foreign approval token. */
export class InvalidLinkException extends BadRequestException {}

interface Payload {
  iv: string;
  value: string;
  mac: string;
  tag?: string;
}

/**
 * Drop-in replacement for Laravel's Crypt::encrypt()/decrypt() (AES-256-CBC + HMAC-SHA256,
 * PHP-serialized value). Tokens are interchangeable with the PHP app as long as APP_KEY matches,
 * so approval links already sitting in mailboxes keep working after the migration.
 */
@Injectable()
export class LaravelCryptService {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    const raw = config.get('APP_KEY', { infer: true });
    this.key = raw.startsWith('base64:') ? Buffer.from(raw.slice(7), 'base64') : Buffer.from(raw);
    if (this.key.length !== 32) {
      throw new Error('APP_KEY must be a 32-byte key (aes-256-cbc), e.g. "base64:..."');
    }
  }

  encrypt(value: unknown): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(phpSerialize(value), 'utf8'), cipher.final()]);

    const ivB64 = iv.toString('base64');
    const valueB64 = encrypted.toString('base64');
    const payload: Payload = { iv: ivB64, value: valueB64, mac: this.mac(ivB64, valueB64), tag: '' };
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  }

  decrypt<T = Record<string, any>>(token: string): T {
    const payload = this.parsePayload(token);
    const expected = Buffer.from(this.mac(payload.iv, payload.value), 'hex');
    const given = Buffer.from(payload.mac, 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new InvalidLinkException('The MAC is invalid.');
    }

    try {
      const decipher = createDecipheriv('aes-256-cbc', this.key, Buffer.from(payload.iv, 'base64'));
      const plain = Buffer.concat([
        decipher.update(Buffer.from(payload.value, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      return phpUnserialize(plain) as T;
    } catch {
      throw new InvalidLinkException('Could not decrypt the data.');
    }
  }

  private mac(iv: string, value: string): string {
    return createHmac('sha256', this.key).update(iv + value).digest('hex');
  }

  private parsePayload(token: string): Payload {
    try {
      const payload = JSON.parse(Buffer.from(token ?? '', 'base64').toString('utf8')) as Payload;
      if (
        typeof payload?.iv === 'string' &&
        typeof payload.value === 'string' &&
        typeof payload.mac === 'string' &&
        Buffer.from(payload.iv, 'base64').length === 16
      ) {
        return payload;
      }
    } catch {
      /* fall through */
    }
    throw new InvalidLinkException('The payload is invalid.');
  }
}
