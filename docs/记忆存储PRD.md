要打造一个像 Roo Code / Claude Code 那样具备“无所不能”的通用基础能力，同时以工作空间（Workspace）为核心进行绝对隔离，并能完整记录每次交互的“思考-执行-用量”全生命周期，我们需要对 Vercel AI SDK 进行深度的工程化设计。

在 Vercel AI SDK 的体系下，你可以通过**文件系统工具集、持久化存储（DB）以及 SDK 的 OpenTelemetry/钩子函数**来实现这些高级特性。

以下是完整的落地系统架构与核心代码实现思路：

---

## 1. 工作空间隔离（Workspace）与物理沙箱

首先，所有的通用能力（读写文件、执行命令）必须严格限制在当前工作空间目录内，绝对不能越权。

### 通用工具集定义（限定在工作空间内）

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

// 获取并校验安全的工作空间物理路径
function getSafePath(workspaceId: string, relativePath: string) {
  const baseDir = path.resolve(process.env.WORKSPACES_ROOT || './workspaces', workspaceId);
  const targetPath = path.resolve(baseDir, relativePath);
  
  // 核心安全防线：防止通过 ../ 逃逸出工作空间
  if (!targetPath.startsWith(baseDir)) {
    throw new Error('Access denied: Attempted to escape workspace boundary.');
  }
  return targetPath;
}

export const createWorkspaceTools = (workspaceId: string) => ({
  // 1. 通用读取文件
  readFile: tool({
    description: '读取工作空间内的文件内容',
    parameters: z.object({ filePath: z.string().describe('相对工作空间的路径') }),
    execute: async ({ filePath }) => {
      const safePath = getSafePath(workspaceId, filePath);
      const content = await fs.readFile(safePath, 'utf-8');
      return { content };
    }
  }),

  // 2. 通用写入/修改文件
  writeFile: tool({
    description: '在工作空间内写入或覆盖文件',
    parameters: z.object({ 
      filePath: z.string().describe('相对工作空间的路径'), 
      content: z.string().describe('要写入的内容') 
    }),
    execute: async ({ filePath, content }) => {
      const safePath = getSafePath(workspaceId, filePath);
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, content, 'utf-8');
      return { success: true, message: `File saved to ${filePath}` };
    }
  }),

  // 3. 通用命令执行 (如运行测试、解析脚本、查询数据库等)
  executeCommand: tool({
    description: '在工作空间根目录下执行终端命令（如 npm test, python script.py）',
    parameters: z.object({ command: z.string().describe('要执行的 shell 命令') }),
    execute: async ({ command }) => {
      const workspacePath = getSafePath(workspaceId, '.');
      try {
        // 在该工作空间的物理路径下执行命令
        const { stdout, stderr } = await execPromise(command, { cwd: workspacePath, timeout: 30000 });
        return { stdout, stderr, success: true };
      } catch (error: any) {
        return { stdout: error.stdout, stderr: error.stderr || error.message, success: false };
      }
    }
  })
});

```

---

## 2. 工作空间全行为记录（包含思考、工具执行、用量）

为了在工作空间中复盘**每一次交互内容、思考过程、工具调用（输入/输出）以及 Token 消耗**，我们需要借助 Vercel AI SDK 的 `onFinish` 回调，将数据结构化地存入你后端的数据库。

### 数据库表设计思路 (以 SQL 为例)

* `workspaces`: 存储工作空间基础信息（ID, 路径, 创建时间）。
* `workspace_memories`: 存储该工作空间的长期记忆/上下文（对应 Claude Code 的 `MEMORY.md` 逻辑）。
* `workspace_runs`: 记录用户发起的每一次任务（Run）。
* `run_steps`: 记录单次任务中，Agent **多步循环 (Multi-step)** 的每一个节点。

```sql
-- 每次交互的运行记录
CREATE TABLE workspace_runs (
    id VARCHAR(255) PRIMARY KEY,
    workspace_id VARCHAR(255) NOT NULL,
    user_prompt TEXT NOT NULL,
    ai_final_response TEXT,
    prompt_tokens INT DEFAULT 0,
    completion_tokens INT DEFAULT 0,
    total_tokens INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 每次运行中，多步工具调用的具体执行步骤（包含思考和工具输入输出）
CREATE TABLE run_steps (
    id SERIAL PRIMARY KEY,
    run_id VARCHAR(255) REFERENCES workspace_runs(id),
    step_number INT NOT NULL,
    thought TEXT, -- 大模型的思考逻辑/CoT
    tool_calls JSONB, -- 调用的工具及参数 [{"name": "readFile", "args": {...}}]
    tool_results JSONB, -- 工具执行后返回的内容 [{"name": "readFile", "result": {...}}]
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

```

### 服务端核心实现：捕获生命周期数据

通过 `streamText` 的事件回调，精准捕获并持久化这一切：

```typescript
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createWorkspaceTools } from './workspaceTools';
import { db } from './db'; // 假设你的数据库连接实例
import { v4 as uuidv4 } from 'uuid';

export async function handleWorkspaceAgent(workspaceId: string, userMessage: string, history: any[]) {
  const runId = uuidv4();
  const tools = createWorkspaceTools(workspaceId);

  // 1. 初始化 Run 记录
  await db.insertRun({
    id: runId,
    workspaceId,
    userPrompt: userMessage
  });

  // 2. 获取该工作空间目前的记忆（Memory）
  const workspaceMemory = await db.getWorkspaceMemory(workspaceId);

  const result = await streamText({
    model: openai('gpt-4o'),
    system: `你是一个部署在服务器端的通用自治智能体，当前运行在工作空间 [${workspaceId}] 中。
    你有权限读写该工作空间的文件并执行命令。
    
    【当前工作空间记忆 (Memory)】:
    ${workspaceMemory || '暂无记忆。'}
    
    【你的工作行为规范】:
    - 每次做决策前，清晰地在输出中展现你的思考过程（Thought）。
    - 随时更新你的长期记忆。如果你发现了项目的重要特征或用户偏好，请使用特定的工具或在最后输出中说明需要更新记忆。`,
    messages: [...history, { role: 'user', content: userMessage }],
    tools,
    maxSteps: 15, // 支持多步自主排查

    // 关键回调 1: 监控和记录每一个 Step 的工具调用和思考过程
    onChunk({ chunk }) {
      // 如果需要前端实时渲染 Agent 的思考（CoT），可以在这里将 chunk 实时推送到前端
    },

    // 关键回调 2: 整个运行（Run）结束时的审计、Token 用量统计、和持久化
    onFinish: async (event) => {
      const { usage, text, steps } = event;
      
      // A. 存储整体用量和 AI 最终回复
      await db.updateRunResult({
        runId,
        aiFinalResponse: text,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
      });

      // B. 遍历并保存每一步(Multi-step)的“思考 -> 工具调用 -> 结果”完整链路
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await db.saveRunStep({
          runId,
          stepNumber: i + 1,
          // 捕获大模型在执行该工具前的思考
          thought: step.text, 
          // 捕获调用的工具名称和参数
          toolCalls: step.toolCalls, 
          // 捕获工具执行后返回给大模型的数据
          toolResults: step.toolResults, 
        });
      }

      // C. 记忆提取逻辑（在交互结束后，自动分析是否有需要更新的长期记忆）
      await updateWorkspaceMemoryIfNeeded(workspaceId, text, steps);
    }
  });

  return result.toDataStreamResponse();
}

```

---

## 3. 实现工作空间级的“记忆体 (Memory)”

要像 Claude Code 维护 `MEMORY.md` 或者是 Roo Code 维护全局 Context 一样让智能体拥有记忆，我们可以通过**外挂数据库**实现，也可以让 Agent **直接在工作空间中读写一个特殊的隐藏文件**：

### 方案 A：物理文件记忆（类似 Claude Code 的 `CLAUDE.md`）

让 Agent 在工作空间内始终拥有一份 `.agent_memory.md`。

* 在发送 Prompt 之前，服务端自动读取这个文件的内容，追加到 System Prompt 中。
* 为 Agent 提供一个 `update_memory` 的 Tool，允许它在发现新知识（如：“这个项目使用的是 Python 3.11 虚拟环境，启动命令是 `poetry run`”）时，主动改写这个文件。

---

## 4. 前端展示：全链路可视化（用量、步骤、思考、中间结果）

在前端，你不再只是渲染一个简单的 `<Markdown/>`，而是根据从服务端流式传输（或接口拉取）的数据，渲染出一个 **“Agent 运行控制台”**：

1. **看板头部（Header）：**
* 显示当前工作空间 ID。
* **用量展示（Token Usage）：** 实时或在交互结束时，直观展示 `Prompt Tokens`、`Completion Tokens` 和折合的单次/累计费用。


2. **步骤折叠器（Step-by-Step Accordion）：**
* **步骤 1：思考** —— 展开显示 Agent 当时的 Chain of Thought。
* **工具调用** —— 显示 `writeFile`，参数：`filePath: "src/index.js"`。
* **执行结果** —— 绿色高亮显示 `Success`。


3. **右侧边栏（Workspace Files）：**
* 显示当前工作空间内的文件目录树。
* 由于所有中间结果都保存在工作空间里，用户可以随时点击右侧树状图查看被 Agent 修改或生成出来的文件。



通过这种“工作空间隔离 + 强类型 Tools 安全校验 + 数据库全步骤审计 + 记忆文件回填”的设计，你就能用 Vercel AI SDK 完美手写出一个**工业级、可审计、且能自主纠错的私有 Agent 开发平台**。