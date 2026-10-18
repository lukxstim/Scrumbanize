import crypto from 'node:crypto';

/** Easy to type from a log: no 0/O, 1/I/L. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * The one-time code for the setup wizard (US-21). Until the first administrator exists, anyone reaching the server
 * could otherwise claim it; the code is only in the server's output (stdout, `docker compose logs`). It is made
 * when first needed and kept in memory only, so every restart without an administrator prints a new one.
 */
export function createSetupCode(announce: (code: string) => void) {
  let code: string | undefined;

  return {
    /** The current code, announcing a new one when there is none. */
    current(): string {
      if (!code) {
        const chars = Array.from(crypto.randomBytes(8), (byte) => ALPHABET[byte % ALPHABET.length]).join('');
        code = `${chars.slice(0, 4)}-${chars.slice(4)}`;
        announce(code);
      }
      return code;
    },
    /** Case and the dash do not matter; compared in constant time. */
    matches(input: string): boolean {
      const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const expected = Buffer.from(normalize(this.current()));
      const given = Buffer.from(normalize(input));
      return given.length === expected.length && crypto.timingSafeEqual(given, expected);
    },
    /** After the setup the code is no longer valid. */
    clear(): void {
      code = undefined;
    },
  };
}

export type SetupCode = ReturnType<typeof createSetupCode>;
