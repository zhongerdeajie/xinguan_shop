import { createHmac } from 'crypto';
import {
  base64UrlDecode,
  bytesToBase64Url,
  hmacSign,
  timingSafeEqualStr,
  verifyAdminToken,
  JwtPayload,
} from './jwt';

function b64u(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function makeToken(secret: string, payload: JwtPayload): string {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest();
  return `${header}.${body}.${b64u(sig)}`;
}

describe('base64UrlDecode', () => {
  it('round-trips a UTF-8 string', () => {
    const encoded = b64u('hello world');
    expect(base64UrlDecode(encoded)).toBe('hello world');
  });

  it('pads short input', () => {
    expect(base64UrlDecode('aGVsbG8')).toBe('hello');
  });
});

describe('bytesToBase64Url', () => {
  it('produces URL-safe output without padding', () => {
    const bytes = Buffer.from('hello world');
    const out = bytesToBase64Url(bytes);
    expect(out).not.toMatch(/[+/=]/);
    expect(out).toBe(b64u('hello world'));
  });
});

describe('timingSafeEqualStr', () => {
  it('returns true for equal strings', () => {
    expect(timingSafeEqualStr('abc', 'abc')).toBe(true);
  });

  it('returns false for different strings of the same length', () => {
    expect(timingSafeEqualStr('abc', 'abd')).toBe(false);
  });

  it('returns false for different lengths without throwing', () => {
    expect(timingSafeEqualStr('abc', 'abcd')).toBe(false);
  });
});

describe('verifyAdminToken', () => {
  const SECRET = 'unit-test-secret';

  it('accepts a valid admin token with future expiry', () => {
    const token = makeToken(SECRET, {
      sub: 1,
      username: 'admin',
      type: 'admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(verifyAdminToken(token, SECRET)).toMatchObject({ type: 'admin', sub: 1 });
  });

  it('rejects a token signed with the wrong secret', () => {
    const token = makeToken('other-secret', {
      type: 'admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(verifyAdminToken(token, SECRET)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = makeToken(SECRET, {
      type: 'admin',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    expect(verifyAdminToken(token, SECRET)).toBeNull();
  });

  it('rejects a customer token even when signed correctly', () => {
    const token = makeToken(SECRET, {
      type: 'customer',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(verifyAdminToken(token, SECRET)).toBeNull();
  });

  it('rejects a malformed token (not three segments)', () => {
    expect(verifyAdminToken('only.two', SECRET)).toBeNull();
    expect(verifyAdminToken('', SECRET)).toBeNull();
  });

  it('rejects when secret is missing', () => {
    const token = makeToken(SECRET, {
      type: 'admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    expect(verifyAdminToken(token, '')).toBeNull();
  });
});