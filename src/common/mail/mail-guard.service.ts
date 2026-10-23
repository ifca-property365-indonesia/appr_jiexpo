import { access, mkdir, open, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { todayStamp } from '../helpers/format.helper';

export type GuardResult = 'sent' | 'already-sent' | 'in-progress';

/**
 * Prevents sending the same email twice (the ERP may call the endpoint repeatedly).
 * Keeps Laravel's marker layout: storage/app/mail_cache/<folder>/<Ymd>/<prefix>_<k1>_<k2>....txt
 *
 * Replaces PHP flock(): the lock file is created atomically with the `wx` flag, so concurrent
 * requests for the same key cannot both send, and no lock files are left behind.
 */
@Injectable()
export class MailGuardService {
  private readonly cacheDir: string;

  constructor(config: ConfigService<Env, true>) {
    this.cacheDir = join(config.get('STORAGE_PATH', { infer: true }), 'app', 'mail_cache');
  }

  markerPath(folder: string, keys: unknown[], prefix = 'email_sent', date = todayStamp()): string {
    const name = [prefix, ...keys.map((k) => String(k ?? '').trim())].join('_');
    return join(this.cacheDir, folder, date, `${name}.txt`);
  }

  async isMarked(path: string): Promise<boolean> {
    return access(path).then(
      () => true,
      () => false,
    );
  }

  /**
   * Runs `send` only if no marker exists for this key; writes the marker after a successful send.
   * Errors thrown by `send` propagate and leave no marker, so the call can be retried.
   */
  async once(path: string, send: () => Promise<void>): Promise<GuardResult> {
    if (await this.isMarked(path)) return 'already-sent';

    await mkdir(dirname(path), { recursive: true });
    const lockPath = `${path}.lock`;
    let lock;
    try {
      lock = await open(lockPath, 'wx');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return 'in-progress';
      throw err;
    }

    try {
      if (await this.isMarked(path)) return 'already-sent';
      await send();
      await writeFile(path, 'sent');
      return 'sent';
    } finally {
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }
}
