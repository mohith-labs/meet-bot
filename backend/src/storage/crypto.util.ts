import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PREFIX = 'enc:v1:';

/**
 * Derive a stable 32-byte key from the app's JWT_SECRET.
 * Keeps secret-at-rest handling self-contained — no extra env var to manage.
 */
function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(`meetbot:storage:${secret}`).digest();
}

/**
 * Encrypt a secret for storage at rest (AES-256-GCM).
 * Returns `enc:v1:<iv>:<authTag>:<ciphertext>` (all base64).
 */
export function encryptSecret(plaintext: string, appSecret: string): string {
  if (!plaintext) return '';

  const key = deriveKey(appSecret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    PREFIX + iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * Decrypt a value produced by `encryptSecret`.
 * Values without the version prefix are returned as-is so that rows written
 * before encryption was introduced keep working.
 */
export function decryptSecret(stored: string, appSecret: string): string {
  if (!stored) return '';
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext

  try {
    const body = stored.slice(PREFIX.length);
    const [ivB64, tagB64, dataB64] = body.split(':');
    if (!ivB64 || !tagB64 || !dataB64) return '';

    const key = deriveKey(appSecret);
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Wrong key or tampered payload — treat as "no secret configured".
    return '';
  }
}

/**
 * Mask a secret for display, e.g. "AKIA…7Q2X" -> "••••••7Q2X".
 */
export function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '••••';
  return '••••••' + value.slice(-4);
}

export const AUTH_TAG_BYTES = AUTH_TAG_LENGTH;
