/**
 * /api/models — 用户模型配置 CRUD
 *
 * 所有操作强制校验 user_id 归属，防止跨用户访问。
 *
 * GET    /api/models        → 列出当前用户所有模型配置
 * POST   /api/models        → 新增模型配置
 * PUT    /api/models/[id]   → 更新模型配置
 * DELETE /api/models/[id]   → 删除模型配置
 */
import { db } from "@/lib/db/client";
import { userModelConfigs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedUser } from "@/lib/auth";
import { encrypt, decrypt } from "@/lib/auth/crypto";

// ============================================================
// 辅助函数
// ============================================================

/** 提取当前用户 ID */
async function getUserId(req: Request): Promise<number | null> {
  const auth = await getAuthenticatedUser(req);
  return auth?.userId ?? null;
}

/** 安全返回模型配置（不包含加密 Key） */
interface ModelConfigSafe {
  id: string;
  label: string;
  modelName: string;
  baseUrl: string | null;
  isDefault: boolean | null;
  createTime: Date;
  updateTime: Date;
}

function toSafeConfig(config: typeof userModelConfigs.$inferSelect): ModelConfigSafe {
  return {
    id: config.id,
    label: config.label,
    modelName: config.modelName,
    baseUrl: config.baseUrl,
    isDefault: config.isDefault,
    createTime: config.createTime,
    updateTime: config.updateTime,
  };
}

// ============================================================
// GET /api/models — 列出当前用户所有模型配置
// ============================================================

export async function GET(req: Request) {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return Response.json(
        { code: 401, message: "请先登录" },
        { status: 401 }
      );
    }

    const configs = await db
      .select()
      .from(userModelConfigs)
      .where(eq(userModelConfigs.userId, userId))
      .orderBy(userModelConfigs.createTime);

    return Response.json({
      code: 200,
      message: "success",
      data: configs.map(toSafeConfig),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json(
      { code: 500, message: `获取模型配置失败: ${message}` },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/models — 新增模型配置
// ============================================================

export async function POST(req: Request) {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return Response.json(
        { code: 401, message: "请先登录" },
        { status: 401 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await req.json()) as Record<string, any>;
    const label = String(body.label ?? "").trim();
    const modelName = String(body.modelName ?? "").trim();
    const apiKey = String(body.apiKey ?? "").trim();
    const baseUrl = body.baseUrl
      ? String(body.baseUrl).trim()
      : "https://api.deepseek.com/v1";
    const isDefault = Boolean(body.isDefault ?? false);

    if (!label || !modelName || !apiKey) {
      return Response.json(
        { code: 400, message: "label, modelName, apiKey 为必填项" },
        { status: 400 }
      );
    }

    // 加密 API Key
    const apiKeyEncrypted = encrypt(apiKey);

    // 如果设置为默认，先取消当前用户的其他默认配置
    if (isDefault) {
      await db
        .update(userModelConfigs)
        .set({ isDefault: false })
        .where(eq(userModelConfigs.userId, userId));
    }

    const [created] = await db
      .insert(userModelConfigs)
      .values({
        userId,
        label,
        modelName,
        apiKeyEncrypted,
        baseUrl: baseUrl || null,
        isDefault,
      })
      .returning();

    return Response.json({
      code: 200,
      message: "模型配置创建成功",
      data: toSafeConfig(created),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[Models POST] 创建失败:", message);
    return Response.json(
      { code: 500, message: `创建模型配置失败: ${message}` },
      { status: 500 }
    );
  }
}

// ============================================================
// PUT /api/models?id=uuid — 更新模型配置
// ============================================================

export async function PUT(req: Request) {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return Response.json(
        { code: 401, message: "请先登录" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const configId = searchParams.get("id");
    if (!configId) {
      return Response.json(
        { code: 400, message: "缺少模型配置 id" },
        { status: 400 }
      );
    }

    // 校验归属
    const [existing] = await db
      .select()
      .from(userModelConfigs)
      .where(
        and(
          eq(userModelConfigs.id, configId),
          eq(userModelConfigs.userId, userId)
        )
      )
      .limit(1);

    if (!existing) {
      return Response.json(
        { code: 404, message: "模型配置不存在或无权访问" },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await req.json()) as Record<string, any>;

    const updateData: Record<string, unknown> = {
      updateTime: new Date(),
    };

    if (body.label !== undefined) {
      updateData.label = String(body.label).trim();
    }
    if (body.modelName !== undefined) {
      updateData.modelName = String(body.modelName).trim();
    }
    if (body.apiKey !== undefined) {
      updateData.apiKeyEncrypted = encrypt(String(body.apiKey).trim());
    }
    if (body.baseUrl !== undefined) {
      updateData.baseUrl = String(body.baseUrl).trim();
    }
    if (body.isDefault !== undefined) {
      const setIsDefault = Boolean(body.isDefault);
      if (setIsDefault) {
        // 先取消当前用户的其他默认配置
        await db
          .update(userModelConfigs)
          .set({ isDefault: false })
          .where(eq(userModelConfigs.userId, userId));
      }
      updateData.isDefault = setIsDefault;
    }

    const [updated] = await db
      .update(userModelConfigs)
      .set(updateData)
      .where(
        and(
          eq(userModelConfigs.id, configId),
          eq(userModelConfigs.userId, userId)
        )
      )
      .returning();

    return Response.json({
      code: 200,
      message: "模型配置更新成功",
      data: toSafeConfig(updated),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[Models PUT] 更新失败:", message);
    return Response.json(
      { code: 500, message: `更新模型配置失败: ${message}` },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE /api/models?id=uuid — 删除模型配置
// ============================================================

export async function DELETE(req: Request) {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      return Response.json(
        { code: 401, message: "请先登录" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const configId = searchParams.get("id");
    if (!configId) {
      return Response.json(
        { code: 400, message: "缺少模型配置 id" },
        { status: 400 }
      );
    }

    // 校验归属后删除
    const result = await db
      .delete(userModelConfigs)
      .where(
        and(
          eq(userModelConfigs.id, configId),
          eq(userModelConfigs.userId, userId)
        )
      );

    if (result.rowCount === 0) {
      return Response.json(
        { code: 404, message: "模型配置不存在或无权访问" },
        { status: 404 }
      );
    }

    return Response.json({
      code: 200,
      message: "模型配置已删除",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[Models DELETE] 删除失败:", message);
    return Response.json(
      { code: 500, message: `删除模型配置失败: ${message}` },
      { status: 500 }
    );
  }
}
