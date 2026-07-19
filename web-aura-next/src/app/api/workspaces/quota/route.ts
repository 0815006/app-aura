/**
 * GET /api/workspaces/quota?workspaceId=xxx — 查询当前配额与今日用量
 * PATCH /api/workspaces/quota — 调整工作空间每日 Token 配额
 */
import { db } from "@/lib/db/client";
import { workspaces, workspaceRuns } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { eq, and, gte } from "drizzle-orm";

const MAX_ALLOWED_LIMIT = 5_000_000;

const DEFAULT_TOKEN_LIMIT = parseInt(
  process.env.AURA_DAILY_TOKEN_LIMIT ?? "500000",
  10
);

/** GET — 查询当前配额与今日用量 */
export async function GET(req: Request) {
  const authPayload = await getAuthenticatedUser(req);
  if (!authPayload) {
    return Response.json(
      { code: 401, message: "请先登录" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");

  if (!workspaceId) {
    return Response.json(
      { code: 400, message: "缺少 workspaceId" },
      { status: 400 }
    );
  }

  try {
    // 验证归属
    const ws = await db.query.workspaces.findFirst({
      where: and(
        eq(workspaces.id, workspaceId),
        eq(workspaces.userId, authPayload.userId)
      ),
      columns: { dailyTokenLimit: true },
    });

    if (!ws) {
      return Response.json(
        { code: 404, message: "工作空间不存在或无权访问" },
        { status: 404 }
      );
    }

    const effectiveLimit = ws.dailyTokenLimit ?? DEFAULT_TOKEN_LIMIT;

    // 今日用量
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayRuns = await db.query.workspaceRuns.findMany({
      where: and(
        eq(workspaceRuns.workspaceId, workspaceId),
        gte(workspaceRuns.createTime, todayStart)
      ),
      columns: { totalTokens: true },
    });
    const todayUsed = todayRuns.reduce((sum, r) => sum + (r.totalTokens ?? 0), 0);

    return Response.json({
      code: 200,
      data: {
        dailyTokenLimit: effectiveLimit,
        isCustom: ws.dailyTokenLimit != null,
        todayUsed,
        todayRemaining: Math.max(0, effectiveLimit - todayUsed),
        usageRatio: effectiveLimit > 0 ? todayUsed / effectiveLimit : 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json(
      { code: 500, message: `查询配额失败: ${message}` },
      { status: 500 }
    );
  }
}

/** PATCH — 调整工作空间每日 Token 配额 */
export async function PATCH(req: Request) {
  const authPayload = await getAuthenticatedUser(req);
  if (!authPayload) {
    return Response.json(
      { code: 401, message: "请先登录" },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as { workspaceId?: string; dailyTokenLimit?: number | null };
    const { workspaceId, dailyTokenLimit } = body;

    if (!workspaceId) {
      return Response.json(
        { code: 400, message: "缺少 workspaceId" },
        { status: 400 }
      );
    }

    // 验证工作空间归属
    const ws = await db.query.workspaces.findFirst({
      where: and(
        eq(workspaces.id, workspaceId),
        eq(workspaces.userId, authPayload.userId)
      ),
      columns: { id: true, dailyTokenLimit: true },
    });

    if (!ws) {
      return Response.json(
        { code: 404, message: "工作空间不存在或无权访问" },
        { status: 404 }
      );
    }

    // null = 恢复全局默认
    if (dailyTokenLimit === null || dailyTokenLimit === undefined) {
      await db
        .update(workspaces)
        .set({ dailyTokenLimit: null, updateTime: new Date() })
        .where(eq(workspaces.id, workspaceId));

      return Response.json({
        code: 200,
        message: "已恢复全局默认配额",
        data: { dailyTokenLimit: DEFAULT_TOKEN_LIMIT, isCustom: false },
      });
    }

    // 校验范围
    if (typeof dailyTokenLimit !== "number" || dailyTokenLimit < 10000) {
      return Response.json(
        { code: 400, message: "配额不能低于 10,000" },
        { status: 400 }
      );
    }
    if (dailyTokenLimit > MAX_ALLOWED_LIMIT) {
      return Response.json(
        { code: 400, message: `配额不能超过 ${MAX_ALLOWED_LIMIT.toLocaleString()}` },
        { status: 400 }
      );
    }

    await db
      .update(workspaces)
      .set({ dailyTokenLimit, updateTime: new Date() })
      .where(eq(workspaces.id, workspaceId));

    return Response.json({
      code: 200,
      message: `配额已更新为 ${dailyTokenLimit.toLocaleString()}`,
      data: { dailyTokenLimit, isCustom: true },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[Quota PATCH] 更新配额失败:", message);
    return Response.json(
      { code: 500, message: `更新配额失败: ${message}` },
      { status: 500 }
    );
  }
}
