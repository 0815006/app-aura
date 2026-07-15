/**
 * AES-256-GCM 加解密工具
 *
 * 用于加密/解密 user_model_configs 表中的 api_key 字段。
 * 加密密钥从 AURA_ENCRYPTION_KEY 环境变量读取，未设置则使用 fallback（仅开发环境安全）。
 */
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag
const KEY_LENGTH = 32; // 256-bit key

/**
 * 获取加密密钥（32 字节）
 * 优先读环境变量 AURA_ENCRYPTION_KEY，否则使用开发 fallback。
 */
function getEncryptionKey(): Buffer {
  const fromEnv = process.env.AURA_ENCRYPTION_KEY;
  if (fromEnv && fromEnv.length >= KEY_LENGTH) {
    return Buffer.from(fromEnv.slice(0, KEY_LENGTH), "utf-8");
  }
  // fallback: 仅开发环境安全，生产务必设置环境变量
  console.warn(
    "[Aura Crypto] ⚠️  AURA_ENCRYPTION_KEY 未设置，使用不安全 fallback key，生产环境务必配置！"
  );
  return Buffer.from("aura_dev_fallback_32bytes_okay!!", "utf-8").slice(
    0,
    KEY_LENGTH
  );
}

/**
 * AES-256-GCM 加密
 * @param plain 明文
 * @returns Base64 编码的密文（格式: iv:authTag:ciphertext，均用 base64）
 */
export function encrypt(plain: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plain, "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // 格式: iv(base64).authTag(base64).ciphertext(base64)
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * AES-256-GCM 解密
 * @param cipher 加密后的密文（格式: iv:authTag:ciphertext）
 * @returns 明文
 */
export function decrypt(cipher: string): string {
  const parts = cipher.split(":");
  if (parts.length !== 3) {
    throw new Error("无效的密文格式：应为 iv:authTag:ciphertext");
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(parts[0], "base64");
  const authTag = Buffer.from(parts[1], "base64");
  const encrypted = Buffer.from(parts[2], "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf-8");
}
