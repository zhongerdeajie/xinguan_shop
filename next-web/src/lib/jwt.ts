// Pure JWT helpers for the Next.js middleware.
//
// These functions are intentionally side-effect-free so they can be unit
// tested with jsdom + happy-dom-free jest. Edge runtime uses Web Crypto;
// Node tests use node:crypto. We polyfill via a thin wrapper.

import { createHmac, timingSafeEqual } from 'crypto';

export interface JwtPayload {
  sub?: number;
  username?: string;
  type?: string;
  iat?: number;
  exp?: number;
}

/** base64url → utf-8 string (used to decode the JWT header / payload). */
export function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '=',
  );
  return Buffer.from(padded, 'base64').toString('utf-8');
}

/** Buffer → base64url (convert HMAC signatures back to JWT wire format). */
export function bytesToBase64Url(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Constant-time string equality (prevents signature-comparison timing attacks). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** HS256 sign of header.payload (Node-side helper used by tests). */
export function hmacSign(secret: string, data: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

/** Verify a JWT synchronously. Returns null on any failure. */
export function verifyAdminToken(token: string, secret: string): JwtPayload | null {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  const expected = bytesToBase64Url(hmacSign(secret, `${headerB64}.${payloadB64}`));
  if (!timingSafeEqualStr(expected, signatureB64)) return null;

  let payload: JwtPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    return null;
  }
  if (payload.type !== 'admin') return null;
  if (!payload.exp || payload.exp * 1000 <= Date.now()) return null;
  return payload;
}