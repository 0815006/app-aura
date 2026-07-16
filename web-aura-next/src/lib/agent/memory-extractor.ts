/**
 * 工作空间记忆自动提取器
 *
 * 在每次 Agent Run 完成后，从对话中提取关键事实，
 * 生成记忆条目供 upsert 到 workspace_memories 表。
 *
 * 策略：用一次轻量级 LLM 调用做后处理（约 200-500 tokens），
 * 从 userPrompt + finalResponse + toolResults 中提取结构化记忆。
 */
import { createDeepSeek } from "@ai-sdk/deepseek";
import { generateText } from "ai";
import { db } from "@/lib/db/client";
import { workspaceMemories } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

interface MemoryExtraction {
  key: string;
  content: string;
  category: "tech-stack" | "convention" | "user-pref" | "fact" | "general";
  importance: number;
}

interface ExtractionInput {
  workspaceId: string;
  runId: string;
  userPrompt: string;
  finalResponse: string;
  toolSummary: string;
  apiKey: string;
  baseUrl: string;
  modelName: string;
}

const EXTRACTION_PROMPT = `你是一个知识管理助手。从以下 AI 对话中提取需要长期记住的关键信息。

规则：
1. 只提取项目事实（技术栈、文件结构、约定、用户偏好），不提取闲聊
2. key 要简短有意义（如 'project-stack', 'python-version'）
3. content 用中文 Markdown 格式，包括你得出此结论的依据
4. category: tech-stack(技术栈), convention(编码约定), user-pref(用户偏好), fact(事实), general(通用)
5. importance: 1-10（最重要的事实给高分）
6. 如果对话中没有值得长期记住的信息，返回空数组

请以 JSON 数组格式返回（只返回 JSON，不包含其他文字）：
[{"key": "...", "content": "...", "category": "...", "importance": 5}]

用户提示: {userPrompt}

AI 回复摘要: {finalResponse}

工具调用摘要: {toolSummary}`;

/**
 * 从对话中自动提取记忆，并 upsert 到 workspace_memories 表。
 *
 * 此函数设计为在 onFinish 回调中异步调用（fire-and-forget），
 * 不阻塞主 Chat 流的返回。
 *
 * @returns 提取到的记忆条目数，失败时返回 0
 */
export async function extractAndSaveMemories(
  input: ExtractionInput
): Promise<number> {
  try {
    const provider = createDeepSeek({
      apiKey: input.apiKey,
      baseURL: input.baseUrl,
    });

    const prompt = EXTRACTION_PROMPT
      .replace("{userPrompt}", input.userPrompt.slice(0, 2000))
      .replace("{finalResponse}", input.finalResponse.slice(0, 3000))
      .replace("{toolSummary}", input.toolSummary.slice(0, 2000));

    const result = await generateText({
      model: provider(input.modelName),
      prompt,
      temperature: 0.1,
    });

    // 解析 JSON 数组
    let extractions: MemoryExtraction[] = [];
    try {
      // 尝试提取 JSON 数组
      const jsonMatch = result.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        extractions = JSON.parse(jsonMatch[0]) as MemoryExtraction[];
      }
    } catch {
      console.log("[MemoryExtractor] 解析 LLM 输出失败，跳过本次提取");
      return 0;
    }

    if (!Array.isArray(extractions) || extractions.length === 0) {
      return 0;
    }

    const now = new Date();
    let saved = 0;

    for (const mem of extractions) {
      if (!mem.key || !mem.content) continue;

      const category = ["tech-stack", "convention", "user-pref", "fact", "general"].includes(mem.category)
        ? mem.category
        : "general";
      const importance = Math.min(10, Math.max(0, Math.round(mem.importance) || 5));

      // upsert: 按 workspaceId + key
      const existing = await db.query.workspaceMemories.findFirst({
        where: and(
          eq(workspaceMemories.workspaceId, input.workspaceId),
          eq(workspaceMemories.key, mem.key)
        ),
      });

      if (existing) {
        await db
          .update(workspaceMemories)
          .set({
            content: mem.content,
            category,
            importance,
            sourceRunId: input.runId,
            updateTime: now,
          })
          .where(eq(workspaceMemories.id, existing.id));
      } else {
        await db.insert(workspaceMemories).values({
          workspaceId: input.workspaceId,
          key: mem.key,
          content: mem.content,
          category,
          importance,
          sourceRunId: input.runId,
          createTime: now,
          updateTime: now,
        });
      }

      saved++;
    }

    console.log(`[MemoryExtractor] 成功提取 ${saved} 条记忆`);
    return saved;
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    console.error(`[MemoryExtractor] 提取失败: ${message}`);
    return 0;
  }
}
