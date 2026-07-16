/**
 * 工作空间记忆管理工具 —— update_memory
 *
 * 允许 Agent 在工作空间中设置、更新或删除长期记忆。
 * 记忆按 workspaceId + key 唯一标识。
 *
 * 规范要点：
 * - 完全 Try-Catch 隔离，失败不中断主 Chat 流
 * - 通过 toolContext 获取当前 workspaceId
 */
import { tool } from "ai";
import { z } from "zod/v4";
import { db } from "@/lib/db/client";
import { workspaceMemories } from "@/lib/db/schema";
import { getToolContext } from "@/lib/agent/tool-context";
import { eq, and } from "drizzle-orm";

export const updateMemory = tool({
  description:
    "更新工作空间的长期记忆。当你发现重要的项目特征、技术栈信息、用户偏好或约定时，使用此工具记录下来。" +
    "key 是记忆的简短标识（如 'project-stack'、'python-version'），content 是详细的 Markdown 记忆正文。" +
    "action='set' 创建或覆盖记忆，action='delete' 删除记忆。",
  parameters: z.object({
    key: z
      .string()
      .describe(
        "记忆的简短标识键，例如 'project-stack'、'python-version'、'coding-style'"
      ),
    content: z.string().describe("记忆的详细内容，支持 Markdown 格式"),
    category: z
      .enum(["tech-stack", "convention", "user-pref", "fact", "general"])
      .default("general")
      .describe(
        "记忆分类: tech-stack(技术栈), convention(约定), user-pref(用户偏好), fact(事实), general(通用)"
      ),
    importance: z
      .number()
      .min(0)
      .max(10)
      .default(5)
      .describe("重要性评分 0-10，分数越高越优先注入 System Prompt"),
    action: z
      .enum(["set", "delete"])
      .default("set")
      .describe("set=创建/更新记忆, delete=删除记忆"),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (args: {
    key: string;
    content: string;
    category: "tech-stack" | "convention" | "user-pref" | "fact" | "general";
    importance: number;
    action: "set" | "delete";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }): Promise<string> => {
    try {
      const ctx = getToolContext();
      if (!ctx?.workspaceId) {
        return JSON.stringify({
          status: "error",
          error: "update_memory 失败: 当前无活跃工作空间",
        });
      }

      const workspaceId = ctx.workspaceId;

      if (args.action === "delete") {
        await db
          .delete(workspaceMemories)
          .where(
            and(
              eq(workspaceMemories.workspaceId, workspaceId),
              eq(workspaceMemories.key, args.key)
            )
          );

        return JSON.stringify({
          status: "success",
          action: "delete",
          key: args.key,
          message: `记忆已删除: ${args.key}`,
        });
      }

      // action === 'set': upsert
      const now = new Date();

      // 先查是否已有同 key 的记忆
      const existing = await db.query.workspaceMemories.findFirst({
        where: and(
          eq(workspaceMemories.workspaceId, workspaceId),
          eq(workspaceMemories.key, args.key)
        ),
      });

      if (existing) {
        await db
          .update(workspaceMemories)
          .set({
            content: args.content,
            category: args.category,
            importance: args.importance,
            updateTime: now,
          })
          .where(eq(workspaceMemories.id, existing.id));

        return JSON.stringify({
          status: "success",
          action: "update",
          key: args.key,
          message: `记忆已更新: ${args.key}`,
        });
      }

      // 新增
      await db.insert(workspaceMemories).values({
        workspaceId,
        key: args.key,
        content: args.content,
        category: args.category,
        importance: args.importance,
        createTime: now,
        updateTime: now,
      });

      return JSON.stringify({
        status: "success",
        action: "create",
        key: args.key,
        message: `记忆已创建: ${args.key}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      return JSON.stringify({
        status: "error",
        error: `update_memory 失败: ${message}`,
      });
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
