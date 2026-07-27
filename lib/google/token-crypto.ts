import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_LENGTH = 12;

function getEncryptionKey() {
  const rawKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

  if (!rawKey) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY belum dikonfigurasi.");
  }

  const key = Buffer.from(rawKey, "base64");

  if (key.length !== 32) {
    throw new Error(
      "GOOGLE_TOKEN_ENCRYPTION_KEY harus berupa base64 dari 32 byte.",
    );
  }

  return key;
}

export function encryptGoogleToken(token: string) {
  if (!token) {
    throw new Error("Token Google kosong dan tidak dapat dienkripsi.");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptGoogleToken(payload: string) {
  const [version, ivValue, authTagValue, encryptedValue] = payload.split(".");

  if (
    version !== VERSION ||
    !ivValue ||
    !authTagValue ||
    !encryptedValue
  ) {
    throw new Error("Format token Google terenkripsi tidak valid.");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );

  decipher.setAuthTag(Buffer.from(authTagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
