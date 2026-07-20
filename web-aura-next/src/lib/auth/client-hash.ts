"use client";

/**
 * 客户端密码哈希工具
 *
 * 使用 Web Crypto API 的 SHA-256 对密码做一次哈希，
 * 确保明文密码不出现在网络传输中。
 *
 * 注意：这层哈希的目的是防止明文密码在网络层泄露（抓包、日志、代理等），
 * 不是替代服务端 bcrypt。服务端会对此哈希值再做 bcrypt 加盐存储。
 */

/**
 * 将密码字符串通过 SHA-256 转换为 64 位十六进制哈希串
 */
export async function hashPasswordClient(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
