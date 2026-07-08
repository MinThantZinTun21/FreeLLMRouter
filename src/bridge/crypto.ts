import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const secret = process.env.PROVIDER_KEY_ENCRYPTION_SECRET || '';
  if (!secret) {
    throw new Error('Missing PROVIDER_KEY_ENCRYPTION_SECRET');
  }
  return createHash('sha256').update(secret).digest();
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('base64url');
}

export function createBridgeApiKey(): { value: string; prefix: string } {
  const raw = randomBytes(24).toString('base64url');
  const value = `fbr_${raw}`;
  return { value, prefix: value.slice(0, 8) };
}

export function encryptProviderSecret(secret: string): {
  encrypted: string;
  iv: string;
  tag: string;
} {
  const iv = randomBytes(12);
  const key = getEncryptionKey();
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url'),
  };
}

export function decryptProviderSecret(payload: {
  encrypted: string;
  iv: string;
  tag: string;
}): string {
  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(payload.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(payload.encrypted, 'base64url')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}
