"use client";

/**
 * 客户端密码哈希工具
 *
 * 使用 SHA-256 对密码做一次哈希，确保明文密码不出现在网络传输中。
 *
 * 优先使用 Web Crypto API (crypto.subtle)，在非安全上下文（HTTP + 内网 IP 直连）
 * 中 crypto.subtle 不可用时，自动回退到 @noble/hashes 的纯 JS 实现。
 *
 * 注意：这层哈希的目的是防止明文密码在网络层泄露（抓包、日志、代理等），
 * 不是替代服务端 bcrypt。服务端会对此哈希值再做 bcrypt 加盐存储。
 */

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/**
 * 将密码字符串通过 SHA-256 转换为 64 位十六进制哈希串
 */
export async function hashPasswordClient(plain: string): Promise<string> {
  // 优先使用 Web Crypto API（本地原生调用，性能最优）
  if (typeof crypto !== "undefined" && crypto.subtle?.digest) {
    try {
      const data = new TextEncoder().encode(plain);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      // Web Crypto 异常时回退
    }
  }

  // 回退：@noble/hashes 纯 JS SHA-256（已审计、零依赖、Tree-shakable）
  const data = new TextEncoder().encode(plain);
  return bytesToHex(sha256(data));
}
