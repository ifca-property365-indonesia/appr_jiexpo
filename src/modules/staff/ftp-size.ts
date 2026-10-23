import { createConnection, type Socket } from 'node:net';

/**
 * Minimal FTP control-channel client for PHP's ftp_connect + ftp_login + ftp_size
 * (SIZE needs no data connection, so no FTP dependency is pulled in for this one call).
 */
export interface FtpOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  timeoutMs?: number;
}

interface FtpReply {
  code: number;
  text: string;
}

export class FtpConnectError extends Error {}

/** File size in bytes, or -1 when it cannot be determined (PHP ftp_size semantics). */
export async function ftpSize(opts: FtpOptions, path: string): Promise<number> {
  const socket = createConnection({ host: opts.host, port: opts.port });
  socket.setEncoding('utf8');
  socket.setTimeout(opts.timeoutMs ?? 15_000);
  const next = replyReader(socket);

  try {
    let greeting: FtpReply;
    try {
      greeting = await next();
    } catch (err) {
      throw new FtpConnectError((err as Error).message);
    }
    if (greeting.code !== 220) throw new FtpConnectError(greeting.text);

    const send = async (command: string) => {
      socket.write(`${command}\r\n`);
      return next();
    };

    let login = await send(`USER ${opts.user}`);
    if (login.code === 331) login = await send(`PASS ${opts.password}`);
    if (login.code !== 230) return -1; // PHP continues after a failed login; ftp_size then fails.

    // The path comes from the request: CR/LF would smuggle extra FTP commands onto the control
    // connection. PHP's ftp_putcmd refuses such arguments, so ftp_size fails (-1) there as well.
    if (/[\r\n\0]/.test(path)) return -1;

    // PHP ftp_size switches to binary mode first.
    if ((await send('TYPE I')).code !== 200) return -1;
    const size = await send(`SIZE ${path}`);
    if (size.code !== 213) return -1;
    const n = Number.parseInt(size.text.slice(4).trim(), 10);
    void send('QUIT').catch(() => undefined);
    return Number.isFinite(n) ? n : -1;
  } finally {
    socket.end();
    socket.destroy();
  }
}

/** Queues complete (possibly multi-line) FTP replies from the control connection. */
function replyReader(socket: Socket): () => Promise<FtpReply> {
  let buffer = '';
  let lines: string[] = [];
  const ready: FtpReply[] = [];
  const waiters: { resolve: (r: FtpReply) => void; reject: (e: Error) => void }[] = [];
  let failure: Error | undefined;

  const flush = () => {
    while (ready.length && waiters.length) waiters.shift()!.resolve(ready.shift()!);
    if (failure) while (waiters.length) waiters.shift()!.reject(failure);
  };
  const fail = (err: Error) => {
    failure ??= err;
    flush();
  };

  socket.on('data', (chunk: string) => {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, '');
      buffer = buffer.slice(idx + 1);
      lines.push(line);
      const m = /^(\d{3}) /.exec(line);
      if (m && lines[0].startsWith(m[1])) {
        ready.push({ code: Number(m[1]), text: lines.join('\n') });
        lines = [];
      }
    }
    flush();
  });
  socket.on('error', fail);
  socket.on('close', () => fail(new Error('FTP connection closed')));
  socket.on('timeout', () => {
    fail(new Error('FTP connection timed out'));
    socket.destroy();
  });

  return () =>
    new Promise<FtpReply>((resolve, reject) => {
      waiters.push({ resolve, reject });
      flush();
    });
}
