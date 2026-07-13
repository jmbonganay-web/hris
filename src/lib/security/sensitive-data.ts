import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

type SensitiveKeyName =
  | "HRIS_DATA_ENCRYPTION_KEY"
  | "HRIS_DATA_HASH_KEY";

function assertKeyLength(key: Buffer, name: string) {
  if (key.length !== KEY_BYTES) {
    throw new Error(`${name} must contain exactly 32 bytes.`);
  }
  return key;
}

function decodeEnvironmentKey(name: SensitiveKeyName) {
  const encoded = process.env[name]?.trim();
  if (!encoded) {
    throw new Error(`${name} is not configured.`);
  }

  const key = Buffer.from(encoded, "base64url");
  const canonical = key.toString("base64url");
  if (
    key.length !== KEY_BYTES
    || canonical !== encoded.replace(/=+$/, "")
  ) {
    throw new Error(`${name} must be a canonical 32-byte base64url value.`);
  }

  return key;
}

function encryptionKey() {
  return decodeEnvironmentKey("HRIS_DATA_ENCRYPTION_KEY");
}

function hashKey() {
  return decodeEnvironmentKey("HRIS_DATA_HASH_KEY");
}

export function encryptSensitiveValue(
  value: string,
  key: Buffer = encryptionKey(),
) {
  assertKeyLength(key, "Encryption key");

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_BYTES,
  });
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    authTag.toString("base64url"),
  ].join(".");
}

export function decryptSensitiveValue(
  payload: string,
  key: Buffer = encryptionKey(),
) {
  assertKeyLength(key, "Encryption key");

  const [version, ivPart, ciphertextPart, tagPart, extra] = payload.split(".");
  if (version !== VERSION) {
    throw new Error("Unsupported sensitive data version.");
  }
  if (!ivPart || !ciphertextPart || !tagPart || extra) {
    throw new Error("Malformed sensitive data payload.");
  }

  try {
    const iv = Buffer.from(ivPart, "base64url");
    const ciphertext = Buffer.from(ciphertextPart, "base64url");
    const authTag = Buffer.from(tagPart, "base64url");

    if (iv.length !== IV_BYTES || authTag.length !== TAG_BYTES) {
      throw new Error("Invalid payload length.");
    }

    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Unable to decrypt sensitive value.");
  }
}

export function hashSensitiveValue(
  value: string,
  key: Buffer = hashKey(),
) {
  assertKeyLength(key, "Hash key");
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

export function normalizeGovernmentId(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizeAccountName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeAccountNumber(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function lastFourAlphanumeric(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").slice(-4);
}
