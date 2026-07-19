/**
 * GET  /api/user-settings  — 获取当前用户的所有设置
 * PATCH /api/user-settings — 更新单项设置（value=null 时删除，恢复默认）
 */
import { db } from "@/lib/db/client";
import { userSettings } from "@/lib/db/schema";
import { getAuthenticatedUser } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

// 有效的设置 key 白名单
const VALID_KEYS = ["bing_search_api_key", "daily_token_limit"] as const;
type SettingKey = (typeof VALID_KEYS)[number];

// 全局默认值（来自 .env.local）
const DEFAULTS: Record<SettingKey, string> = {
  bing_search_api_key: process.env.BING_SEARCH_API_KEY ?? "",
  daily_token_limit: process.env.AURA_DAILY_TOKEN_LIMIT ?? "500000",
};

/** GET — 返回当前用户所有设置（含回退默认值） */
export async function GET(req: Request) {
  const authPayload = await getAuthenticatedUser(req);
  if (!authPayload) {
    return Response.json({ code: 401, message: "请先登录" }, { status: 401 });
  }

  try {
    const rows = await db.query.userSettings.findMany({
      where: eq(userSettings.userId, authPayload.userId),
    });

    const map: Record<string, string | null> = {};
    for (const key of VALID_KEYS) {
      const row = rows.find((r) => r.key === key);
      map[key] = row?.value ?? null;
    }

    // 解析有效值：用户设了用用户的，否则用默认
    const resolved: Record<string, { value: string; isCustom: boolean }> = {};
    for (const key of VALID_KEYS) {
      const customVal = map[key];
      resolved[key] = {
        value: customVal ?? DEFAULTS[key],
        isCustom: customVal !== null,
      };
    }

    return Response.json({ code: 200, data: { settings: resolved } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json(
      { code: 500, message: `获取设置失败: ${message}` },
      { status: 500 }
    );
  }
}

/** PATCH — 更新单项设置 */
export async function PATCH(req: Request) {
  const authPayload = await getAuthenticatedUser(req);
  if (!authPayload) {
    return Response.json({ code: 401, message: "请先登录" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      key?: string;
      value?: string | null;
    };
    const { key, value } = body;

    if (!key || !VALID_KEYS.includes(key as SettingKey)) {
      return Response.json(
        { code: 400, message: `无效的设置 key，有效值: ${VALID_KEYS.join(", ")}` },
        { status: 400 }
      );
    }

    const settingKey = key as SettingKey;

    // 删除 = 恢复默认
    if (value === null || value === undefined) {
      await db
        .delete(userSettings)
        .where(
          and(
            eq(userSettings.userId, authPayload.userId),
            eq(userSettings.key, settingKey)
          )
        );

      return Response.json({
        code: 200,
        message: "已恢复默认",
        data: { key, value: DEFAULTS[settingKey], isCustom: false },
      });
    }

    // 校验：daily_token_limit 范围
    if (settingKey === "daily_token_limit") {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 10000) {
        return Response.json(
          { code: 400, message: "配额不能低于 10,000" },
          { status: 400 }
        );
      }
      if (num > 5_000_000) {
        return Response.json(
          { code: 400, message: "配额不能超过 5,000,000" },
          { status: 400 }
        );
      }
    }

    // upsert
    await db
      .insert(userSettings)
      .values({
        userId: authPayload.userId,
        key: settingKey,
        value,
        updateTime: new Date(),
      })
      .onConflictDoUpdate({
        target: [userSettings.userId, userSettings.key],
        set: { value, updateTime: new Date() },
      });

    return Response.json({
      code: 200,
      message: "设置已保存",
      data: { key, value, isCustom: true },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return Response.json(
      { code: 500, message: `保存设置失败: ${message}` },
      { status: 500 }
    );
  }
}
