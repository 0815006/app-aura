/**
 * POST /api/db-connections/[id]/test — 测试数据库连接
 *
 * 从 DB 读取连接配置，解密密码，尝试建立 TCP 连接并执行 SELECT 1。
 * 更新 last_tested_at、test_result、test_message。
 */
import { db } from "@/lib/db/client";
import { dbConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthenticatedUser } from "@/lib/auth";
import { decrypt } from "@/lib/auth/crypto";
import { Pool } from "pg";
// mysql2 按需动态导入（避免未安装时报错）

export async function POST(
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

    // 查询连接配置
    const connection = await db.query.dbConnections.findFirst({
      where: and(
        eq(dbConnections.id, id),
        eq(dbConnections.userId, auth.userId)
      ),
    });

    if (!connection) {
      return Response.json(
        { code: 404, message: "数据库连接不存在或无权访问" },
        { status: 404 }
      );
    }

    let testResult: string;
    let testMessage: string;
    let pool: Pool | null = null;

    try {
      const password = decrypt(connection.passwordEncrypted);

      if (connection.dbType === "postgresql") {
        // PostgreSQL 测试连接
        pool = new Pool({
          host: connection.host,
          port: connection.port,
          database: connection.dbName,
          user: connection.username,
          password,
          ssl: connection.sslMode === "require" ? { rejectUnauthorized: false } : false,
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 5000,
          max: 1,
        });

        const startTime = Date.now();
        const result = await pool.query("SELECT 1 AS test, version() AS version");
        const latency = Date.now() - startTime;

        const pgVersion =
          result.rows[0]?.version?.toString().match(/PostgreSQL\s+([\d.]+)/)?.[1] ??
          "未知";
        testResult = "success";
        testMessage = `连接成功 (PostgreSQL ${pgVersion}, 延迟 ${latency}ms)`;

        console.log(
          `[DB Test] ✅ 连接测试成功: ${connection.label} (${connection.host}:${connection.port}/${connection.dbName})`
        );
      } else if (connection.dbType === "mysql") {
        // MySQL 测试连接 — 动态导入 mysql2
        try {
          const mysql2 = await import("mysql2/promise");
          const mysqlConn = await mysql2.createConnection({
            host: connection.host,
            port: connection.port,
            database: connection.dbName,
            user: connection.username,
            password,
            ssl: connection.sslMode === "true" ? {} : undefined,
            connectTimeout: 5000,
          });

          const startTime = Date.now();
          const [rows] = await mysqlConn.execute("SELECT 1 AS test, VERSION() AS version");
          const latency = Date.now() - startTime;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const myVersion = (rows as any[])[0]?.version?.toString() ?? "未知";
          testResult = "success";
          testMessage = `连接成功 (MySQL ${myVersion}, 延迟 ${latency}ms)`;

          await mysqlConn.end();

          console.log(
            `[DB Test] ✅ MySQL 连接测试成功: ${connection.label} (${connection.host}:${connection.port}/${connection.dbName})`
          );
        } catch (mysqlErr) {
          const msg = mysqlErr instanceof Error ? mysqlErr.message : "未知错误";
          // 如果 mysql2 未安装
          if (
            msg.includes("Cannot find module") ||
            msg.includes("Module not found")
          ) {
            testResult = "failed";
            testMessage = "MySQL 测试失败: mysql2 驱动未安装，请运行 npm install mysql2";
          } else {
            throw mysqlErr;
          }
        }
      } else {
        testResult = "failed";
        testMessage = `不支持的数据库类型: ${connection.dbType}`;
      }
    } catch (testErr) {
      const message = testErr instanceof Error ? testErr.message : "未知错误";
      testResult = "failed";
      testMessage = `连接失败: ${message}`;
      console.error(
        `[DB Test] ❌ 连接测试失败: ${connection.label} (${connection.host}:${connection.port}) — ${message}`
      );
    } finally {
      // 立即释放测试连接池
      if (pool) {
        await pool.end().catch(() => {});
      }
    }

    // 更新测试结果
    await db
      .update(dbConnections)
      .set({
        lastTestedAt: new Date(),
        testResult,
        testMessage,
        updateTime: new Date(),
      })
      .where(eq(dbConnections.id, id));

    const success = testResult === "success";
    return Response.json({
      code: 200,
      message: success ? "连接测试成功" : "连接测试失败",
      data: { success, message: testMessage },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error("[DB Connections Test] 测试连接异常:", message);
    return Response.json(
      { code: 500, message: `测试连接失败: ${message}` },
      { status: 500 }
    );
  }
}
