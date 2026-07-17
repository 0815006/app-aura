/**
 * /api/db-connections — 数据库连接配置 CRUD
 *
 * GET    /api/db-connections         → 列出当前用户所有数据库连接（不返回密码）
 * POST   /api/db-connections         → 新增数据库连接（密码 AES-256-GCM 加密存储）
 */
import { db } from "@/lib/db/client";
import { dbConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedUser } from "@/lib/auth";
import { encrypt } from "@/lib/auth/crypto";

// ============================================================
// 辅助函数
// ============================================================

/** 安全返回数据库连接配置（不包含加密密码） */
interface DbConnectionSafe {
  id: string;
  label: string;
  dbType: string;
  host: string;
  port: number;
  dbName: string;
  username: string;
  sslMode: string | null;
  extraArgs: unknown;
  lastTestedAt: string | null;
  testResult: string | null;
  testMessage: string | null;
  status: string;
  createTime: Date;
  updateTime: Date;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSafeConnection(config: any): DbConnectionSafe {
  return {
    id: config.id,
    label: config.label,
    dbType: config.dbType,
    host: config.host,
    port: config.port,
    dbName: config.dbName,
    username: config.username,
    sslMode: config.sslMode,
    extraArgs: config.extraArgs,
    lastTestedAt: config.lastTestedAt,
    testResult: config.testResult,
    testMessage: config.testMessage,
    status: config.status,
    createTime: config.createTime,
    updateTime: config.updateTime,
  };
}

// ============================================================
// GET /api/db-connections — 列出用户所有数据库连接
// ============================================================

export async function GET(req: Request) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return Response.json(
        { code: 401, message: "请先登录" },
        { status: 401 }
      );
    }

    const connections = await db.query.dbConnections.findMany({
      where: and(
        eq(dbConnections.userId, auth.userId),
        eq(dbConnections.status, "active")
      ),
      orderBy: (conns, { desc }) => [desc(conns.createTime)],
    });

    return Response.json({
      code: 200,
      message: "success",
      data: { connections: connections.map(toSafeConnection) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[DB Connections GET] 获取连接列表失败:", message);
    return Response.json(
      { code: 500, message: `获取数据库连接列表失败: ${message}` },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/db-connections — 新增数据库连接
// ============================================================

export async function POST(req: Request) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return Response.json(
        { code: 401, message: "请先登录" },
        { status: 401 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await req.json()) as Record<string, any>;

    const label = String(body.label ?? "").trim();
    const dbType = String(body.dbType ?? "postgresql").trim();
    const host = String(body.host ?? "").trim();
    const port = parseInt(String(body.port ?? "5432"), 10);
    const dbName = String(body.dbName ?? "").trim();
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "").trim();
    const sslMode = body.sslMode ? String(body.sslMode).trim() : "prefer";
    const extraArgs = body.extraArgs ?? {};

    // 必填校验
    if (!label || !host || !dbName || !username || !password) {
      return Response.json(
        { code: 400, message: "label, host, dbName, username, password 为必填项" },
        { status: 400 }
      );
    }

    // 校验 label 唯一性
    const existing = await db.query.dbConnections.findFirst({
      where: and(
        eq(dbConnections.userId, auth.userId),
        eq(dbConnections.label, label),
        eq(dbConnections.status, "active")
      ),
    });
    if (existing) {
      return Response.json(
        { code: 409, message: `连接标签 "${label}" 已存在，请使用不同的标签` },
        { status: 409 }
      );
    }

    // 加密密码
    const passwordEncrypted = encrypt(password);

    const [created] = await db
      .insert(dbConnections)
      .values({
        userId: auth.userId,
        label,
        dbType,
        host,
        port,
        dbName,
        username,
        passwordEncrypted,
        sslMode,
        extraArgs,
      })
      .returning();

    return Response.json({
      code: 201,
      message: "数据库连接创建成功",
      data: toSafeConnection(created),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[DB Connections POST] 创建连接失败:", message);
    return Response.json(
      { code: 500, message: `创建数据库连接失败: ${message}` },
      { status: 500 }
    );
  }
}
