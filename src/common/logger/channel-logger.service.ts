import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { now, todayStamp } from '../helpers/format.helper';

/** Log channels carried over from Laravel config/logging.php. */
export type LogChannel =
  | 'app'
  | 'sendmail'
  | 'sendmailfeedback'
  | 'sendmailapproval'
  | 'resend'
  | 'resend_apprlist';

type Level = 'info' | 'warning' | 'error';

/**
 * File logger that keeps the Laravel log layout so existing log tooling still works:
 * `storage/logs/sendmail/<Ymd>/sendmailapproval-<Y-m-d>.log`, line format `[date] env.LEVEL: msg`.
 */
@Injectable()
export class ChannelLogger {
  private readonly console = new Logger('Mail');
  private readonly logDir: string;
  private readonly env: string;

  constructor(config: ConfigService<Env, true>) {
    this.logDir = join(config.get('STORAGE_PATH', { infer: true }), 'logs');
    this.env = config.get('NODE_ENV', { infer: true });
  }

  info(channel: LogChannel, message: string): void {
    this.write(channel, 'info', message);
  }

  warning(channel: LogChannel, message: string): void {
    this.write(channel, 'warning', message);
  }

  error(channel: LogChannel, message: string): void {
    this.write(channel, 'error', message);
  }

  private filePath(channel: LogChannel): string {
    const day = now('YYYY-MM-DD');
    switch (channel) {
      case 'app':
        return join(this.logDir, `laravel-${day}.log`);
      case 'sendmail':
        return join(this.logDir, `sendmail-${day}.log`);
      case 'resend_apprlist':
        return join(this.logDir, 'sendmail', todayStamp(), `apprlist-${day}.log`);
      default:
        return join(this.logDir, 'sendmail', todayStamp(), `${channel}-${day}.log`);
    }
  }

  private write(channel: LogChannel, level: Level, message: string): void {
    const method = level === 'warning' ? 'warn' : level === 'info' ? 'log' : 'error';
    this.console[method](`[${channel}] ${message}`);

    const file = this.filePath(channel);
    const line = `[${now('YYYY-MM-DD HH:mm:ss')}] ${this.env}.${level.toUpperCase()}: ${message}\n`;
    void mkdir(dirname(file), { recursive: true })
      .then(() => appendFile(file, line))
      .catch((err: Error) => this.console.error(`Cannot write log ${file}: ${err.message}`));
  }
}
