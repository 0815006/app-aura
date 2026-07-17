/**
 * 工具执行上下文 —— globalThis 实现
 *
 * AsyncLocalStorage 在 AI SDK 的 streamText 中不工作：
 * streamText 同步返回，工具在后续异步流中执行，脱离了 runWithContext 的上下文。
 *
 * 改用 globalThis 临时存储 —— Node.js 单线程模型保证同一请求的
 * 异步链不会被其他请求打断（单用户场景完全可靠）。
 */
import path from "path";
import { resolveSafePath, getDataRoot, isClientMode } from "@/lib/env";

export interface ToolContext {
  userId: number | null;
  workspaceId: string | null;
  sceneSlug?: string;
  dbConnectionId?: string;
}

const CTX_KEY = "__aura_tool_ctx__";

/** 设置当前请求的工具上下文（在 streamText 之前调用） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setToolContext(ctx: ToolContext): void {
  (globalThis as any)[CTX_KEY] = ctx;
}

/** 清除上下文（请求结束后调用，防止泄漏） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function clearToolContext(): void {
  delete (globalThis as any)[CTX_KEY];
}

/** 获取当前请求的工具上下文 */
export function getToolContext(): ToolContext | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any)[CTX_KEY] as ToolContext | undefined;
}

/**
 * Workspace-aware 安全路径解析。
 *
 * 优先级：
 * 1. 客户端模式 → 原样返回 userPath
 * 2. 有 workspaceId + userId → DATA_ROOT/workspaces/user_{id}/{wsId}/{userPath}
 * 3. 否则 → DATA_ROOT/{userPath}
 */
export function resolveWorkspaceAwarePath(userPath: string): string {
  if (isClientMode()) return userPath;

  const ctx = getToolContext();
  if (ctx?.workspaceId && ctx.userId) {
    const userRoot = path.resolve(getDataRoot(), "workspaces", `user_${ctx.userId}`);
    const workspaceRoot = path.resolve(userRoot, ctx.workspaceId);
    const targetPath = path.resolve(workspaceRoot, userPath);

    if (!targetPath.startsWith(workspaceRoot)) {
      console.error(
        `[ToolContext] ❌ 路径越权拒绝: userPath="${userPath}" → targetPath="${targetPath}", workspaceRoot="${workspaceRoot}"`
      );
      throw new Error(`路径越权：禁止访问工作空间以外的文件 (${userPath})`);
    }
    if (!targetPath.startsWith(userRoot)) {
      console.error(
        `[ToolContext] ❌ 跨用户越权拒绝: userPath="${userPath}" → targetPath="${targetPath}", userRoot="${userRoot}"`
      );
      throw new Error(`路径越权：禁止访问其他用户的工作空间 (${userPath})`);
    }
    console.log(
      `[ToolContext] ✅ workspace 路径: "${userPath}" → "${targetPath}" (userId=${ctx.userId}, wsId=${ctx.workspaceId})`
    );
    return targetPath;
  }

  // 无上下文：回退到 DATA_ROOT
  const fallback = resolveSafePath(userPath);
  console.log(
    `[ToolContext] ⚠️ 无工作空间上下文，回退到 DATA_ROOT: "${userPath}" → "${fallback}" (ctx=${
      ctx ? `userId=${ctx.userId}, wsId=${ctx.workspaceId}` : "undefined"
    })`
  );
  return fallback;
}
