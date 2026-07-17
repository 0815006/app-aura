/**
 * /api/db-connections/[id] — 单个数据库连接操作
 *
 * PUT    /api/db-connections/[id] → 更新数据库连接
 * DELETE /api/db-connections/[id] → 删除数据库连接
 */
import { db } from "@/lib/db/client";
import { dbConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedUser } from "@/lib/auth";
import { encrypt } from "@/lib/auth/crypto";

// ============================================================
// PUT /api/db-connections/[id] — 更新数据库连接
// ============================================================

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return Response.json(
        { code: 401, message: "请先登录" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    // 校验归属
    const [existing] = await db
      .select()
      .from(dbConnections)
      .where(
        and(
          eq(dbConnections.id, id),
          eq(dbConnections.userId, auth.userId)
        )
      )
      .limit(1);

    if (!existing) {
      return Response.json(
        { code: 404, message: "数据库连接不存在或无权访问" },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await req.json()) as Record<string, any>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {
      updateTime: new Date(),
    };

    if (body.label !== undefined) {
      const newLabel = String(body.label).trim();
      // 检查新 label 是否与其他连接冲突
      if (newLabel !== existing.label) {
        const conflict = await db.query.dbConnections.findFirst({
          where: and(
            eq(dbConnections.userId, auth.userId),
            eq(dbConnections.label, newLabel),
            eq(dbConnections.status, "active")
          ),
        });
        if (conflict && conflict.id !== id) {
          return Response.json(
            { code: 409, message: `连接标签 "${newLabel}" 已被其他连接使用` },
            { status: 409 }
          );
        }
      }
      updateData.label = newLabel;
    }
    if (body.dbType !== undefined) updateData.dbType = String(body.dbType).trim();
    if (body.host !== undefined) updateData.host = String(body.host).trim();
    if (body.port !== undefined) updateData.port = parseInt(String(body.port), 10);
    if (body.dbName !== undefined) updateData.dbName = String(body.dbName).trim();
    if (body.username !== undefined) updateData.username = String(body.username).trim();
    if (body.password !== undefined && String(body.password).trim() !== "") {
      updateData.passwordEncrypted = encrypt(String(body.password).trim());
    }
    if (body.sslMode !== undefined) updateData.sslMode = String(body.sslMode).trim();
    if (body.extraArgs !== undefined) updateData.extraArgs = body.extraArgs;

    const [updated] = await db
      .update(dbConnections)
      .set(updateData)
      .where(
        and(
          eq(dbConnections.id, id),
          eq(dbConnections.userId, auth.userId)
        )
      )
      .returning();

    return Response.json({
      code: 200,
      message: "数据库连接更新成功",
      data: {
        id: updated.id,
        label: updated.label,
        dbType: updated.dbType,
        host: updated.host,
        port: updated.port,
        dbName: updated.dbName,
        username: updated.username,
        sslMode: updated.sslMode,
        extraArgs: updated.extraArgs,
        lastTestedAt: updated.lastTestedAt,
        testResult: updated.testResult,
        testMessage: updated.testMessage,
        status: updated.status,
        createTime: updated.createTime,
        updateTime: updated.updateTime,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[DB Connections PUT] 更新连接失败:", message);
    return Response.json(
      { code: 500, message: `更新数据库连接失败: ${message}` },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE /api/db-connections/[id] — 删除数据库连接（软删除）
// ============================================================

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return Response.json(
        { code: 401, message: "请先登录" },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    // 软删除：设置 status 为 archived
    const result = await db
      .update(dbConnections)
      .set({ status: "archived", updateTime: new Date() })
      .where(
        and(
          eq(dbConnections.id, id),
          eq(dbConnections.userId, auth.userId)
        )
      );

    if (result.rowCount === 0) {
      return Response.json(
        { code: 404, message: "数据库连接不存在或无权访问" },
        { status: 404 }
      );
    }

    return Response.json({
      code: 200,
      message: "数据库连接已删除",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[DB Connections DELETE] 删除连接失败:", message);
    return Response.json(
      { code: 500, message: `删除数据库连接失败: ${message}` },
      { status: 500 }
    );
  }
}
