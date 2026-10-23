import { createCipheriv, createHmac, randomBytes } from 'node:crypto';
import { LaravelCryptService } from './laravel-crypt.service';
import { phpSerialize, phpUnserialize } from './php-serialize';

const KEY = 'base64:w20CZQOb5dTFPDTwS1M664bshrofag3Jah+BODAIVKg=';
const service = new LaravelCryptService({ get: () => KEY } as never);

/** Token built exactly like Laravel's Encrypter::encrypt() (PHP json_encode + openssl). */
function laravelToken(serialized: string): string {
  const key = Buffer.from(KEY.slice(7), 'base64');
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const value = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]).toString('base64');
  const ivB64 = iv.toString('base64');
  const mac = createHmac('sha256', key).update(ivB64 + value).digest('hex');
  return Buffer.from(JSON.stringify({ iv: ivB64, value, mac, tag: '' })).toString('base64');
}

describe('php-serialize', () => {
  it('matches PHP serialize() output, with byte lengths for UTF-8', () => {
    expect(phpSerialize({ doc_no: 'A1', level_no: '1', n: null, x: 'é' })).toBe(
      'a:4:{s:6:"doc_no";s:2:"A1";s:8:"level_no";s:1:"1";s:1:"n";N;s:1:"x";s:2:"é";}',
    );
  });

  it('round-trips nested arrays and lists', () => {
    const value = { a: ['x', 'y'], b: { c: 1, d: true, e: 1.5 } };
    expect(phpUnserialize(phpSerialize(value))).toEqual(value);
  });
});

describe('LaravelCryptService', () => {
  it('decrypts tokens produced by Laravel', () => {
    const token = laravelToken('a:2:{s:6:"doc_no";s:5:"PK001";s:8:"level_no";s:1:"1";}');
    expect(service.decrypt(token)).toEqual({ doc_no: 'PK001', level_no: '1' });
  });

  it('round-trips and produces URL-path-safe tokens', () => {
    const payload = { entity_cd: '01', doc_no: 'X/1', text: 'Payment Request' };
    const token = service.encrypt(payload);
    expect(token).not.toMatch(/[/+]/);
    expect(service.decrypt(token)).toEqual(payload);
  });

  it('rejects tampered tokens', () => {
    const json = JSON.parse(Buffer.from(service.encrypt({ a: 'b' }), 'base64').toString());
    json.mac = '0'.repeat(64);
    expect(() => service.decrypt(Buffer.from(JSON.stringify(json)).toString('base64'))).toThrow('MAC');
  });
});
