/**
 * Aura 环境变量与路径辅助
 *
 * 双端架构核心：
 * - AURA_MODE = 'server' | 'client'
 * - DATA_ROOT  服务端数据根目录
 * - AURA_SERVER_URL 客户端模式下指向服务端地址
 */
import path from "path";
import fs from "fs";

/** 当前运行模式 */
export type AuraMode = "server" | "client";

/** 获取当前 AURA_MODE，默认 server */
export function getAuraMode(): AuraMode {
  const mode = process.env.AURA_MODE;
  if (mode === "client") return "client";
  return "server";
}

/** 是否为服务端模式 */
export function isServerMode(): boolean {
  return getAuraMode() === "server";
}

/** 是否为客户端模式 */
export function isClientMode(): boolean {
  return getAuraMode() === "client";
}

/**
 * 获取数据根目录
 * 优先读环境变量 DATA_ROOT，否则按平台回退默认值。
 */
export function getDataRoot(): string {
  if (isClientMode()) return "";

  const fromEnv = process.env.DATA_ROOT;
  if (fromEnv) return fromEnv;

  if (process.platform === "win32") {
    return "D:\\data\\aura";
  }
  return "/data/aura";
}

/**
 * 获取服务端 API 地址
 * 客户端模式下用于转发请求到服务端。
 */
export function getServerUrl(): string {
  if (isServerMode()) return "";
  return process.env.AURA_SERVER_URL || "http://localhost:8086";
}

// ============================================================
// 工作空间路径辅助（仅服务端）
// ============================================================

/**
 * ★ Phase 7: 按用户隔离的工作空间根路径
 *
 * 新签名（推荐）：
 *   getWorkspaceRootForUser(userId, workspaceId)
 *     → DATA_ROOT/workspaces/user_{userId}/{workspaceId}
 *
 * 旧签名（兼容，仅在无用户上下文的场景使用）：
 *   getWorkspaceRoot(workspaceId)
 *     → DATA_ROOT/workspaces/{workspaceId}
 */

/**
 * 获取指定用户的指定工作空间根目录绝对路径
 *
 * @param userId 用户 ID
 * @param workspaceId 工作空间 UUID
 * @returns 例如 "D:\data\aura\workspaces\user_1\abc-123"
 */
export function getWorkspaceRootForUser(
  userId: number,
  workspaceId: string
): string {
  if (isClientMode()) return "";
  return path.join(getDataRoot(), "workspaces", `user_${userId}`, workspaceId);
}

/**
 * 获取工作空间的根目录绝对路径（无用户隔离，仅兼容旧逻辑）
 * 适用于尚无 userId 上下文的场景。
 */
export function getWorkspaceRoot(workspaceId: string): string {
  if (isClientMode()) return "";
  return path.join(getDataRoot(), "workspaces", workspaceId);
}

/**
 * ★ Phase 7: 按用户隔离的工作空间路径解析
 *
 * @param userId 用户 ID
 * @param workspaceId 工作空间 UUID
 * @param userPath 用户指定的相对路径（相对于 workspace 根目录），如 'subdir/file.txt'
 * @throws 路径越权时抛出错误
 */
export function resolveWorkspacePathForUser(
  userId: number,
  workspaceId: string,
  userPath: string
): string {
  if (isClientMode()) {
    return userPath;
  }

  const userRoot = path.resolve(
    getDataRoot(),
    "workspaces",
    `user_${userId}`
  );
  const workspaceRoot = path.resolve(userRoot, workspaceId);
  const targetPath = path.resolve(workspaceRoot, userPath);

  // 双重越权校验
  if (!targetPath.startsWith(workspaceRoot)) {
    throw new Error(
      `路径越权：禁止访问工作空间以外的文件 (${userPath})`
    );
  }
  if (!targetPath.startsWith(userRoot)) {
    throw new Error(
      `路径越权：禁止访问其他用户的工作空间 (${userPath})`
    );
  }

  return targetPath;
}

/**
 * 解析工作空间内的安全路径（无用户隔离，仅兼容旧逻辑）
 */
export function resolveWorkspacePath(
  workspaceId: string,
  userPath: string
): string {
  if (isClientMode()) {
    return userPath;
  }

  const workspaceRoot = path.resolve(getWorkspaceRoot(workspaceId));
  const targetPath = path.resolve(workspaceRoot, userPath);

  if (!targetPath.startsWith(workspaceRoot)) {
    throw new Error(
      `路径越权：禁止访问工作空间以外的文件 (${userPath})`
    );
  }
  return targetPath;
}

/**
 * 解析相对于 DATA_ROOT 的安全路径（通用，非 workspace）
 * 自动校验路径越权，防止 Prompt 注入攻击。
 *
 * @throws 路径越权时抛出错误
 */
export function resolveSafePath(userPath: string): string {
  if (isClientMode()) return userPath;

  const allowedRoot = path.resolve(getDataRoot());
  const targetPath = path.resolve(allowedRoot, userPath);
  if (!targetPath.startsWith(allowedRoot)) {
    throw new Error(
      `路径越权：禁止访问 DATA_ROOT 以外的文件 (${userPath})`
    );
  }
  return targetPath;
}

/**
 * 确保 DATA_ROOT 下的标准子目录存在
 * 在服务启动时调用一次即可。
 */
export function ensureDataDirs(): void {
  if (isClientMode()) return;

  const dataRoot = getDataRoot();
  const subDirs = ["workspaces", "uploads", "logs"];

  for (const dir of subDirs) {
    const fullPath = path.join(dataRoot, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`📁 [Aura] 已创建数据目录: ${fullPath}`);
    }
  }
}

/**
 * 为指定工作空间创建磁盘目录
 * 新建工作空间时调用
 */
export function createWorkspaceDir(workspaceId: string): string {
  if (isClientMode()) return "";

  // 使用旧路径格式（无 userId），userId 级别的目录在用户注册时创建
  const workspaceRoot = getWorkspaceRoot(workspaceId);
  if (!fs.existsSync(workspaceRoot)) {
    fs.mkdirSync(workspaceRoot, { recursive: true });

    // 创建 .meta 系统隐藏目录
    const metaDir = path.join(workspaceRoot, ".meta");
    fs.mkdirSync(metaDir, { recursive: true });

    console.log(`📁 [Aura] 已创建工作空间目录: ${workspaceRoot}`);
  }
  return workspaceRoot;
}

/**
 * ★ Phase 7: 为用户创建指定工作空间的磁盘目录（带 userId 隔离）
 */
export function createWorkspaceDirForUser(
  userId: number,
  workspaceId: string
): string {
  if (isClientMode()) return "";

  const workspaceRoot = getWorkspaceRootForUser(userId, workspaceId);
  if (!fs.existsSync(workspaceRoot)) {
    fs.mkdirSync(workspaceRoot, { recursive: true });

    const metaDir = path.join(workspaceRoot, ".meta");
    fs.mkdirSync(metaDir, { recursive: true });

    console.log(`📁 [Aura] 已创建用户工作空间目录: ${workspaceRoot}`);
  }
  return workspaceRoot;
}

/**
 * 删除指定工作空间的磁盘目录
 * 删除工作空间时调用
 */
export function removeWorkspaceDir(workspaceId: string): void {
  if (isClientMode()) return;

  const workspaceRoot = getWorkspaceRoot(workspaceId);
  if (fs.existsSync(workspaceRoot)) {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    console.log(`🗑️ [Aura] 已删除工作空间目录: ${workspaceRoot}`);
  }
}

/**
 * ★ Phase 7: 按用户删除工作空间（带 userId 隔离）
 */
export function removeWorkspaceDirForUser(
  userId: number,
  workspaceId: string
): void {
  if (isClientMode()) return;

  const workspaceRoot = getWorkspaceRootForUser(userId, workspaceId);
  if (fs.existsSync(workspaceRoot)) {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    console.log(`🗑️ [Aura] 已删除用户工作空间目录: ${workspaceRoot}`);
  }
}
