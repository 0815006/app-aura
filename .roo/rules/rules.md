# Aura 智能体平台项目规范 (Next.js + Vercel AI SDK + DeepSeek)

## 1. 项目基础信息与目录结构

当前工作区是一个基于 **Next.js (Standalone 模式)**、**Vercel AI SDK** 和 **DeepSeek-R1/V3** 的全栈智能体（Agent）平台。

```text
app-aura/                   # 顶层主目录
├── docs/                   # 文档与本地知识库工作目录（网页端可直接扫描、使用这里的文件）
├── deploy/                 # 部署与本地开发脚本
│   ├── docker-compose.yml  # PostgreSQL + pgvector 数据库编排
│   ├── pgvector-start.bat  # 启动 PostgreSQL 容器
│   └── dev-start.bat       # 安装依赖 + 数据库迁移 + 启动 Next.js 开发服务器
└── web-aura-next/          # 核心全栈工程 (Next.js 前端 UI + 后端 Agent API)
    ├── src/
    │   ├── app/            # App Router：前端页面 + 后端 api/ 路由 (Route Handler)
    │   ├── lib/agent/      # ★ 90% 精力核心：Aura 工具箱 (tools/*.ts)
    │   └── lib/db/         # 数据库层 (Drizzle ORM schema / client / migrate)
    ├── drizzle/            # 自动生成的迁移 SQL（由 npm run db:generate 产出）
    ├── package.json
    └── next.config.ts
```

- **全栈框架**：`web-aura-next` (Next.js Standalone) —— 单一工程负责前端 UI 与后端 API，支持打包成独立 Node.js 服务脱离 Vercel 运行。
- **AI 引擎**：`Vercel AI SDK` (`ai`) —— 核心负责流式蹦字（Streaming）与多轮工具调用（Function Calling）状态机。
- **计算大脑**：`DeepSeek-R1 / V3` —— 通过 `@ai-sdk/deepseek` 官方 API 接入，提供极高性价比的强推理能力。
- **数据库**：`aura_db` (PostgreSQL 16 + pgvector 插件) —— Docker 一键部署，承载聊天历史存储及向量检索（RAG）。
- **文件存储**：前期统一使用服务器本地挂载目录（如 `docs/`），利用 Node.js `fs` 模块管理。当存储量突破 100GB 或多机扩展时，再无缝切换到 MinIO。

---

## 2. 后端开发规范 (Next.js Route Handler + Vercel AI SDK)

你是一个资深的 Node.js/TypeScript 全栈架构师。在处理后端代码时，必须遵守以下准则：

### 2.1 核心架构与 AI 编排

* **全栈路由**：所有后端 API 必须放置在 `src/app/api/` 目录下，使用 Next.js App Router 的 Route Handler（`route.ts`）实现。
* **AI SDK 流式模式**：所有与大模型交互的接口必须使用 `streamText()` 或 `streamUI()` 进行流式响应，确保打字机效果。响应头必须包含 `Content-Type: text/plain; charset=utf-8` 和 `Transfer-Encoding: chunked`。
* **工具注册**：所有供大模型调用的工具必须通过 `tool()` 函数定义，包含 `description` 和 `parameters`（Zod schema），并注入到 `streamText({ tools: { ... } })` 中。
* **代码风格**：严格使用 TypeScript，禁止 `any`。优先使用 `interface` 定义数据结构，使用 `zod` 进行运行时校验。
* **工具异常隔离**：`src/lib/agent/tools/` 下所有工具必须具备完备的 Try-Catch 捕获。Tool 的失败**绝对不能导致主 Chat 流中断**，应返回结构化错误 JSON（如 `{"error": "Prometheus 连接超时"}`）给大模型，由大模型自行决定如何向用户解释与重试。
* **超时熔断机制**：调用外部系统（数据库、Prometheus、JMeter 等）的 Tool 必须显式设置 Timeout（默认 10 秒）。超时后自动熔断并返回错误上下文，避免因外部服务不可用导致整个 Agent 会话卡死。

### 2.2 接口路径规范

* **路径前缀**：所有 Route Handler 的目录路径**必须以 `/api` 开头**（例如：`/api/chat`, `/api/files/list`），**禁止**添加 `/v1` 等版本号。
* **HTTP 方法**：严格遵循 RESTful 语义——`GET` 读取、`POST` 创建/执行、`PUT` 更新、`DELETE` 删除。

### 2.3 安全与权限控制

* **路径越权隔离**：在所有涉及磁盘操作的工具函数内，第一行代码必须校验物理路径是否逃逸了当前工作空间的根目录（`docs/`），严防 Prompt 注入攻击导致读取系统根目录或敏感文件。
  ```typescript
  const allowedRoot = path.resolve(process.cwd(), 'docs');
  const targetPath = path.resolve(allowedRoot, userPath);
  if (!targetPath.startsWith(allowedRoot)) {
    throw new Error('路径越权：禁止访问 docs/ 以外的文件');
  }
  ```
* **环境变量**：所有敏感配置（API Key、数据库密码等）必须通过 `.env.local` 传入，**禁止硬编码**。使用 `process.env.XXX` 读取。

### 2.4 持久层与数据库

* **数据库驱动**：Drizzle ORM + `pg` (node-postgres) 连接 PostgreSQL 16。
* **向量扩展**：启用 `pgvector` 插件，向量字段使用 `vector(1536)` 或 `vector(768)` 类型（取决于 Embedding 模型维度）。
* **表结构定义**：在 [`src/lib/db/schema/index.ts`](src/lib/db/schema/index.ts) 中用 TypeScript 声明所有表，Drizzle 自动生成 SQL 迁移文件到 [`drizzle/`](drizzle/) 目录。**禁止手动改库**。
* **数据迁移工作流（对标 Flyway）**：
  1. 修改 `src/lib/db/schema/index.ts`
  2. `npm run db:generate` — 自动生成版本化 SQL 到 `drizzle/` 目录
  3. `npm run db:migrate` — 执行迁移，通过 `drizzle.__drizzle_migrations` 表追踪已执行版本
* **SQL 规范**：PostgreSQL 16 语法，字段必须带 `COMMENT`。核心时间审计字段命名为 `create_time` 和 `update_time`，默认为 `CURRENT_TIMESTAMP`。

### 2.5 响应与异常

* **统一响应**：所有 Route Handler 返回统一的 JSON 结构：
  ```typescript
  interface ApiResponse<T> {
    code: number;    // 200 成功，其他为错误码
    message: string; // 提示信息
    data?: T;        // 业务数据
  }
  ```
* **全局异常**：通过统一的 `try/catch` 包装或 Next.js 的 `error.tsx` 捕获异常，返回标准 `ApiResponse` 格式。

### 2.6 Aura 智能体工具箱开发规范

#### 2.6.1 核心开发分工

* **90% 的精力**：在 `src/lib/agent/tools/` 目录下用 TypeScript 编写各类业务工具。工具的定位是**胶水层**——核心职责不是直接跑复杂的业务逻辑，而是通过标准协议（SSH、HTTP Restful、Shell 命令）去调用各场景原生的工具链（如 DBA 的 Python 诊断脚本、压测专家的 JMeter 命令行等）。
* **10% 的精力**：在前端利用 React/Tailwind 配合 AI SDK 提供的 `useChat` 钩子，将大模型输出的结构化数据渲染为炫酷的看板或拓扑图。

#### 2.6.2 工具定义规范

* **长耗时异步原则**：对于执行时间大于 5 秒的工具（如启动压测、大表索引分析），Tool 不应同步等待任务结束。应向后端队列或 PG 状态表提交任务后立即向大模型返回 `{"status": "processing", "taskId": "xxx"}`，后续由 Agent 通过轮询或 SSE 推送获取最终结果。

* **Zod Schema**：每个工具必须使用 Zod 定义精确的参数 schema，大模型依赖 schema 和 description 来决定何时调用。
  ```typescript
  import { tool } from 'ai';
  import { z } from 'zod';

  export const listDirectory = tool({
    description: '获取指定目录下的子目录和文件列表。用于浏览 docs/ 目录结构。',
    parameters: z.object({
      path: z.string().describe('要浏览的目录路径，相对于 docs/ 根目录'),
    }),
    execute: async ({ path: dirPath }) => {
      // 路径越权校验（第一行）
      // ... 执行逻辑
    },
  });
  ```
* **工具返回值**：被工具函数的 `execute` 方法返回值**尽量统一为 `string`**。成功返回数据或"操作成功"；失败返回具体错误描述（大模型可根据报错字符串自我修正并重试）。
* **原子化设计**：工具功能要越单一越好。**禁止**写"缝合怪"工具（如 `analyze_excel_and_save()`），应将读数据、大模型推理、写成果拆分为独立原子工具。
* **结构化输出**：大模型生成文件时，利用 `streamText` 的 `response_format` 强约束输出格式为 JSON，再由 TypeScript 工具层完成文件物化。**大模型只负责推理出数据，绝不直接写二进制文件。**

#### 2.6.3 ReAct 降级与重试

* 当 Agent 在推理环中连续调用工具失败超过 **5 次**，必须捕获异常，向前端发送 `FAILED` 状态并中断任务，防止无限消耗 Token。
* 利用 AI SDK 的 `maxSteps` 参数控制最大工具调用步数。

### 2.7 智能体 8 大原子工具箱

基础通用型智能体必须具备以下四大类、共 8 个原子级基础工具，统一放置在 `src/lib/agent/tools/` 目录下：

#### 一、文件与目录感知类（Read & Discovery）

* **1. `list_directory(path)`** —— 目录探测器：获取指定目录下的子目录和文件列表。
* **2. `preview_file_lines(path, lines)`** —— 智能预览器：读取文件前 N 行，避免大文件 Token 溢出。
* **3. `read_file_full(path)`** —— 全文读取器：读取小文件的完整文本内容。

#### 二、资产产出与修改类（Write & Mutation）

* **4. `write_text_file(path, content)`** —— 基础文本写入：在指定路径（限于 `docs/`）创建或覆盖纯文本文件。
* **5. `generate_structured_excel(path, sheet_name, json_data)`** —— 结构化表格生成：接收 JSON 数组，调用 Excel 库（如 `exceljs`）生成 Excel 文件。

#### 三、动态计算与代码执行类（Sandbox & Compute）

* **6. `execute_python_code(script_content)`** —— Python 沙箱执行器：在隔离环境中运行 Python 脚本并返回 stdout。

#### 四、外部世界连接类（Connectivity）

* **7. `web_search(query)`** —— 实时联网搜索：调用搜索引擎 API（如 Bing/SerpAPI），返回前 N 条结果摘要。
* **8. `http_request(url, method, headers, body)`** —— 通用网络请求：自主发起标准 HTTP 请求。

### 2.8 异步任务与流式推送

* **异步执行**：大模型分析耗时较长时，后端立即返回流式响应，前端通过 AI SDK 的 `useChat` 实时获取状态。
* **SSE / Streaming**：Agent 的思考过程（Thought）、工具调用（Tool Call）、中间日志必须通过 Server-Sent Events 或流式响应实时推送到前端控制台。
* **流式输出**：大模型流式响应通过 AI SDK 的 `textStream` 逐块传递到前端，Nginx 代理层必须配置 `proxy_buffering off;` 和 `proxy_cache off;`，确保打字机效果。
* **会话持久化**：禁止依赖前端内存保存聊天历史。每次 `useChat` 请求必须携带 `chatId`，后端 `/api/chat` 在 `onFinish` 回调中将多轮对话增量写入 PostgreSQL。刷新页面或跨设备登录后，通过 `chatId` 恢复完整历史记录。利用 pgvector 扩展可在后续实现历史对话的语义检索（RAG）。

### 2.9 工具胶水层架构

* **定位**：`src/lib/agent/tools/` 是 Aura 的"胶水层"，其核心职责是通过标准协议桥接各场景原生工具链：
  * `ssh_exec()` —— SSH 连接远程服务器执行运维脚本
  * `http_request()` —— 调用 Prometheus/Grafana REST API 获取监控数据
  * `execute_shell()` —— 在本地沙箱执行 Shell/Python 脚本
  * `db_query()` —— 通过 pg 驱动直连数据库执行只读 SQL
* **不造轮子**：不在 TypeScript 中重写 Python/Shell 分析逻辑，让运维专家的现有脚本资产零成本复用。

---

## 3. 前端开发规范 (Next.js + React + TypeScript)

你是一个资深的前端架构师。**禁止输出 Pages Router、Options API 或纯 JS**：

### 3.1 语法与 UI

* **核心语法**：必须使用 **React 函数组件 + TypeScript**。严禁使用 `any`。
* **样式方案**：使用 **Tailwind CSS** 进行样式编写，保持与 `create-next-app --tailwind` 初始化模板一致。
* **组件组织规范**：页面专用的复杂弹窗、抽屉等组件，**禁止**堆砌在单一的页面文件中。必须将其抽离并统一放置在 `src/components/` 下对应的业务子目录中（例如：`src/components/agent/AgentToolCallCard.tsx`）。子目录名称必须与业务页面的名称或功能严格对应。

### 3.2 网络请求与 API 管理

* **API 调用**：前端优先使用 AI SDK 的 `useChat` 钩子与大模型交互，其他 REST 接口使用 `fetch` 封装。
* **接口路径**：请求路径必须与后端 `/api` 前缀保持一致。
* **请求封装**：
  * 封装位于 `src/lib/api-client.ts`。
  * **错误处理**：统一识别 `code !== 200` 并通过 `toast` 提示（注意：需放行特定业务逻辑错误码，由页面自行处理）。

### 3.3 全局 Layout 框架规范

AI 在搭建或修改系统级主架构时，必须严格遵循以下策略的 React/TS 实现：

#### 3.3.1 布局组件组织

* **布局根目录**：所有布局相关组件必须置于 `src/components/layout/` 目录下。
* **组件拆分**：
  * `Layout.tsx` —— 主容器，负责整体的 CSS Grid 骨架渲染，管理侧边栏折叠/展开状态（默认展开）。
  * `Header.tsx` —— 顶部导航栏（含应用标题 Aura、Logo、用户信息、折叠按钮及登出按钮）。折叠按钮位于 Header 左侧，点击可切换侧边栏展开/收起状态。
  * `Sidebar.tsx` —— 左侧导航菜单，支持页面/场景切换。**支持可折叠模式**：展开时显示图标 + 文字（宽度 240px），折叠后仅显示图标（宽度 64px），默认状态为展开。折叠/展开状态由 `Layout.tsx` 通过 props 传递控制。
  * `StatusBar.tsx` —— 底部状态栏（系统时间 + 连接状态）。

#### 3.3.2 经典网格布局框架 (CSS Grid)

主环境布局 `src/components/layout/Layout.tsx` 必须严格基于以下网格骨架进行渲染，禁止随意修改结构：

* **结构划分**：
```css
.layout-wrapper {
  display: grid;
  grid-template-columns: 240px 1fr; /* 左侧菜单宽 240px，折叠时变为 64px */
  grid-template-rows: auto 1fr 34px; /* 顶栏自适应，中间主视图，底栏 34px */
  height: 100dvh;
  width: 100%;
  overflow: hidden;
}
/* 侧边栏折叠状态 */
.layout-wrapper.collapsed {
  grid-template-columns: 64px 1fr;
}
```

* **网格区域映射**：
```css
grid-template-areas:
  "sidebar header"
  "sidebar main"
  "status-bar status-bar";
```

* **状态持久栏 (Status Bar)**：底部必须保留统一的 `status-bar`（对应 `StatusBar.tsx`），用于展示系统时间和连接状态。

* **智能体工作台视图**：在 `main` 区域内，采用「左侧文件空间 + 右侧控制台」的 flex 子布局，该子布局不得破坏外层 Grid 骨架。

#### 3.3.3 智能体控制台交互规范

* **日志流展示**：Agent 执行的每一步（系统状态、工具调用、内在思考、完工收货）必须在右侧日志区实时展示，使用不同颜色/图标区分日志类型（`info` / `tool` / `thought` / `success`）。
* **@文件 语法**：输入区支持 `@` 触发的文件选择器，自动扫描左侧目录树叶子节点，大模型后端获取被 `@` 文件的准确全限定路径。
* **成果联动**：大模型调用写工具生成文件后，左侧目录树实时新增文件节点并呈现高亮闪烁动效（CSS `@keyframes blink`），一段时间后自动消失。

---

## 4. 工程化与部署

### 4.1 自动化部署

* **Docker Compose**：提供一键启动脚本 `deploy/docker-compose.yml`，包含 `aura-db`（PostgreSQL 16 + pgvector）服务。数据库名 `aura_db`，容器名 `aura-postgres`，默认用户/密码 `root/root`。
* **Next.js Standalone**：生产环境使用 `next build` 构建后，通过 `next start` 或自定义 `server.js` 启动独立 Node.js 服务。
* **网络隔离**：生产环境中数据库仅在 Docker 内部网络开放，**禁止**将 PostgreSQL 端口映射到宿主机。本地开发环境允许映射 `5432` 端口以便调试工具连接。Next.js 容器与 PG 容器置于独立的 Docker bridge 网络中，**严禁**将数据库高危端口直接暴露到公网。由于 Aura 具备 DBA（连库）和监控（调接口）权限，Docker 容器内的网络出站规则需严格限制目标地址白名单。

### 4.2 代理配置

* **Next.js 配置**：在 `next.config.ts` 中根据环境配置 `basePath` 和 API 转发（如有需要）。
* **流式接口代理**：针对大模型流式响应接口（如 `/api/chat`），Nginx 代理层必须配置：
  ```nginx
  location /api/chat {
    proxy_pass http://web-aura-next:3000;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 120s;
  }
  ```
  确保逐块流式传递不被缓冲，实现打字机效果。

### 4.3 多环境部署与脚本编写规范

#### 4.3.1 项目交付架构与目录规范

* 所有部署脚本、自动化批处理文件、Nginx 配置文件，必须全部存放在 `deploy/` 目录下。

#### 4.3.2 脚本命名硬性规范

在编写或修改任何部署/打包脚本时，必须严格遵守以下命名动宾结构，禁止使用模糊的名称：

* **本地开发**：`dev-*.sh` 或 `dev-*.bat`
* **生产部署**：`deploy-*.sh` 或 `deploy-*.bat`
* **数据备份**：`backup-*.sh`

#### 4.3.3 技术栈特定约束

* **Node.js**：要求 Node.js 20+ LTS，Next.js 15+。
* **前端 (Next.js)**：
  * 必须妥善处理大模型流式响应接口（如 `/api/chat`），确保代理层不开启压缩和缓存缓冲，实现打字机效果逐块流式传递。
  * 开发模式下 `next dev` 默认支持热更新。

### 4.4 数据存储路径规范（跨平台 DATA_ROOT）

所有 Aura 平台涉及的文件存储（工作空间、用户上传、Agent 产出、日志文件等），必须统一通过 `DATA_ROOT` 环境变量指定根目录，**禁止硬编码绝对路径**。

#### 4.4.1 默认路径约定

| 平台 | 默认 `DATA_ROOT` | 部署目录 (`DEPLOY_DIR`) |
|------|------------------|------------------------|
| **Windows** | `D:\data\aura` | `D:\app\aura-server` |
| **Linux** | `/data/aura` | `/app/aura-server` |

#### 4.4.2 代码中获取数据路径

后端所有涉及文件存储的代码必须通过以下辅助函数解析路径，**禁止直接拼接字符串**：

```typescript
// src/lib/env.ts —— 环境变量与路径辅助
import path from 'path';

/** 获取数据根目录，优先读环境变量 DATA_ROOT，否则按平台回退 */
export function getDataRoot(): string {
  return process.env.DATA_ROOT || (
    process.platform === 'win32' ? 'D:\\data\\aura' : '/data/aura'
  );
}
```

#### 4.4.3 部署约束

* **环境变量注入**：部署脚本（如 [`deploy/build-server-lan.bat`](../../deploy/build-server-lan.bat)）在生成 `.env` / WinSW 服务定义文件时，必须写入 `DATA_ROOT` 环境变量。
* **目录自创建**：服务启动时，若 `DATA_ROOT` 目录不存在，Node.js 进程应自动递归创建 `workspaces/`、`uploads/`、`logs/` 等标准子目录。
* **与 `docs/` 的关系**：`docs/` 是开发期嵌入在项目内的知识库目录，仅供开发调试使用；生产环境（Standalone 模式）下 `docs/` 不会被部署，所有文件持久化操作必须走 `DATA_ROOT`。

---

## 5. 前端数据交互规范 (AI 执行指令)

1. **接口驱动**：页面数据必须来源于 `/api` 的 API 调用，在 `useEffect` 或 `useSWR` 中发起请求获取真实数据，禁止使用静态假数据。
2. **加载反馈**：请求期间必须展示加载状态（Skeleton 或 Spinner），空数据时使用空状态占位组件。
3. **技术栈合规**：所有生成代码必须严格遵守本规范定义的技术栈版本（Next.js 15 + React 19 + TypeScript + Tailwind CSS），不得降级为旧版语法。

---

## 6. 专属提示

* **生成 SQL**：核心时间审计字段命名为 `create_time` 和 `update_time`，且默认为 `CURRENT_TIMESTAMP`。核心业务表主键使用 `UUID` 或自增 `BIGSERIAL`。使用 PostgreSQL 16 语法（不使用反引号、不使用 `ENGINE=InnoDB`）。
* **输出页面**：给出完整的 `.tsx` 文件（React 函数组件, TypeScript, Tailwind classes）。
* **大模型交互铁律**：大模型**只负责动脑子（推理、关联、出数据）**，生成文件的工作**坚决交给 TypeScript 工具层**。大模型只需把结构化 JSON 数据喂给工具即可。
* **工具原子化铁律**：工具功能越单一越好，将控制权牢牢交在大模型手里。禁止写"缝合怪"工具。
* **权限最小化铁律**：所有磁盘操作工具方法内，第一行必须是路径越权校验，限制在 `docs/` 目录范围内。
* **流式优先铁律**：所有大模型交互接口必须采用流式响应（`streamText`），不得使用非流式的 `generateText` 阻塞等待完整响应。
