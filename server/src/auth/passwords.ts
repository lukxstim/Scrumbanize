import crypto from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Password hashes (US-21): Argon2id with Node's built-in crypto (no native package, so the desktop build stays as it
 * is), scrypt where a runtime lacks crypto.argon2. Both in a PHC-like string that carries its parameters, so they can
 * be raised later without breaking existing hashes.
 */

/** OWASP's minimum for Argon2id: 19 MiB memory, 2 passes, 1 lane. */
const ARGON2 = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 };
/** OWASP's scrypt setting: N = 2^17, r = 8, p = 1 (128 MiB). */
const SCRYPT = { N: 2 ** 17, r: 8, p: 1, keylen: 32, maxmem: 256 * 1024 * 1024 };

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

type Argon2 = (
  algorithm: 'argon2id',
  params: { message: string; nonce: Buffer; parallelism: number; tagLength: number; memory: number; passes: number },
  callback: (error: Error | null, result: Buffer) => void,
) => void;
const argon2 = (crypto as unknown as { argon2?: Argon2 }).argon2;
const argon2Async = argon2 && promisify(argon2);
const scryptAsync = promisify(crypto.scrypt) as (password: string, salt: Buffer, keylen: number, options: crypto.ScryptOptions) => Promise<Buffer>;

const b64 = (buffer: Buffer) => buffer.toString('base64url');
const fromB64 = (text: string) => Buffer.from(text, 'base64url');

export async function hashPassword(password: string, { forceScrypt = false } = {}): Promise<string> {
  const salt = crypto.randomBytes(16);
  if (argon2Async && !forceScrypt) {
    const tag = await argon2Async('argon2id', { message: password, nonce: salt, ...ARGON2 });
    return `$argon2id$v=19$m=${ARGON2.memory},t=${ARGON2.passes},p=${ARGON2.parallelism}$${b64(salt)}$${b64(tag)}`;
  }
  const key = await scryptAsync(password, salt, SCRYPT.keylen, SCRYPT);
  return `$scrypt$N=${SCRYPT.N},r=${SCRYPT.r},p=${SCRYPT.p}$${b64(salt)}$${b64(key)}`;
}

/** False for a wrong password and for anything that is not a hash of ours. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  try {
    if (parts[1] === 'argon2id' && parts.length === 6) {
      if (!argon2Async) return false;
      const params = Object.fromEntries(parts[3]!.split(',').map((kv) => kv.split('=') as [string, string]));
      const expected = fromB64(parts[5]!);
      const tag = await argon2Async('argon2id', {
        message: password,
        nonce: fromB64(parts[4]!),
        memory: Number(params.m),
        passes: Number(params.t),
        parallelism: Number(params.p),
        tagLength: expected.length,
      });
      return crypto.timingSafeEqual(tag, expected);
    }
    if (parts[1] === 'scrypt' && parts.length === 5) {
      const params = Object.fromEntries(parts[2]!.split(',').map((kv) => kv.split('=') as [string, string]));
      const expected = fromB64(parts[4]!);
      const key = await scryptAsync(password, fromB64(parts[3]!), expected.length, {
        N: Number(params.N),
        r: Number(params.r),
        p: Number(params.p),
        maxmem: SCRYPT.maxmem,
      });
      return crypto.timingSafeEqual(key, expected);
    }
  } catch {
    // A damaged hash never matches.
  }
  return false;
}

/** A hash to compare against when there is no user, so a login takes as long whether or not the email exists. */
let dummyHash: Promise<string> | undefined;
export const timingDummyHash = () => (dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex')));
