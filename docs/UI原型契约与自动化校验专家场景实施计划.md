# UI 原型契约与自动化校验专家场景 — 实施计划

> **基于 PRD**: [UI原型契约与自动化校验专家PRD.md](./UI原型契约与自动化校验专家PRD.md)
> **创建日期**: 2026-07-19
> **场景类型**: 工具驱动（需新增 Playwright 浏览器自动化工具）
> **上游依赖**: 无（独立场景）

---

## 一、场景概述

### 1.1 场景定位

在银行系统开发中，UI 测试最容易变成"空中楼阁"——大模型如果只看网页截图，会频繁发生坐标对不齐、动态加载卡顿、复杂组件无法交互等问题。

**UI 原型契约与自动化校验专家（bank-ui-validator）** 采用"双端资产静态比对 + 声明式自动化脚本执行"的工程化路线：

1. **文本与业务要素契约**：比对设计稿要求的字段在目标系统页面上是否存在，文字是否错漏
2. **状态机与路由契约**：点击操作后 URL 路由或弹窗状态是否按设计文档正确流转

该方案绕开大模型最不擅长的"看图猜坐标"，转而让 Playwright 充当智能体的"确定性手脚"去抓取真实的 DOM 文本与结构，再利用大模型的"多源文本语义比对"能力去抓错。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| 原型要素解析 | 读取 `inputs/ui-specs/` 下的结构化原型 JSON，提取页面准入元素清单 |
| 无头浏览器抓取 | 驱动 Playwright 无头浏览器，注入登录态，抓取目标系统真实 DOM 文本 |
| 语义交叉比对 | LLM 将"期望文本"与"实际文本"逐一比对，标记 MATCHED/MISSING/TEXT_MISMATCH |
| 路由合规校验 | 验证实际页面 URL 是否与设计文档中的预期路由一致 |
| 审计报告固化 | 生成 Markdown 审计报告 + Playwright 脚本，留存工作空间供复用 |

### 1.3 场景特征

- **类型**: 工具驱动场景（需新增 2 个专属工具）
- **DB 依赖**: 无
- **新工具**: ✅ 需要 —— `execute_playwright_validation` + `save_ui_audit_report`
- **新依赖**: ✅ 需要 —— `playwright` (Node.js 浏览器自动化库)
- **输入**: 工作空间 `inputs/ui-specs/` 下的原型 JSON + 设计文档 + `env_profile.json`
- **输出**: `outputs/ui-test/` 目录下的审计报告 Markdown + 差异数据 JSON + Playwright 脚本

---

## 二、与现有场景的对照分析

| 维度 | DB 慢 SQL | 功能点估算 | 测试分析 | **UI 契约校验（新）** |
|------|:---:|:---:|:---:|:---:|
| 类型 | DB 驱动 | 纯文件 | 纯文件 | **工具驱动** |
| 专属工具 | 4 个 DB 工具 | 无 | 无 | **2 个新工具** |
| 新依赖 | pg/mysql2 | 无 | 无 | **playwright** |
| 输入方式 | DB 连接 | 文件目录 | 文件目录 + 上游 JSON | **文件目录 + URL** |
| 输出方式 | 文件报告 | JSON + MD | MD + Excel + JSON | **MD + JSON + .spec.js** |
| requiredInputs | sql_file | req_dir | req_dir | **target_url + spec_dir** |

**结论**: 本场景是继 DB 诊断专家之后，第二个需要专属工具包的场景。核心差异在于——DB 诊断专家的工具是对已有数据库能力的封装（PostgreSQL/MySQL 协议），而 UI 校验专家的工具引入了全新的"浏览器自动化"能力维度。PRD 中提出的 `parse_ui_prototype_spec` 工具，在当前阶段通过 System Prompt 知识 + `read_file_full` 即可覆盖（Agent 读取 JSON 后在 CoT 中完成解析）。

---

## 三、PRD 工具到实施工具的映射

| PRD 工具 | 实施策略 | 说明 |
|----------|---------|------|
| `parse_ui_prototype_spec` | ❌ 不单独实现 | Agent 通过 `read_file_full` 读取原型 JSON，在 CoT 中完成要素解析。System Prompt 中明确 JSON 解析规则和要素提取规范。 |
| `execute_playwright_validation` | ✅ 新工具 | 核心工具。使用 Playwright Node.js API 直接驱动无头浏览器，支持 Cookie 注入/表单登录两种鉴权方式，抓取页面 DOM 文本和路由信息。 |
| `save_ui_audit_report` | ✅ 新工具 | 便利工具。接收结构化的比对差异数据，格式化为符合银行审计规范的 Markdown 报告并持久化到工作空间。Agent 也可绕过此工具直接用 `write_text_file` 写入。 |

---

## 四、工具详细设计

### 工具一：`execute_playwright_validation`（核心）

**分类**: `sandbox-compute` / 新建 `browser-automation` 分类

**功能**: 在服务器端驱动 Playwright 无头浏览器，注入鉴权信息，打开目标系统页面，抓取真实渲染的 DOM 文本与结构。

**参数 Schema**:

```ts
parameters: z.object({
  targetUrl: z.string().url()
    .describe('目标系统页面的完整 URL，如 https://bank-uat.example.com/transfer/confirm'),
  
  authConfig: z.object({
    mode: z.enum(['COOKIE_INJECTION', 'FORM_LOGIN', 'NONE'])
      .default('NONE')
      .describe('鉴权模式：COOKIE_INJECTION=注入已有Cookie绕过登录，FORM_LOGIN=自动填写表单登录，NONE=无鉴权直接访问'),
    
    loginUrl: z.string().optional()
      .describe('FORM_LOGIN 模式下的登录页面 URL'),
    username: z.string().optional()
      .describe('FORM_LOGIN 模式下的测试账号'),
    password: z.string().optional()
      .describe('FORM_LOGIN 模式下的测试密码'),
    
    // 银行系统抗自动化核心解法：预置有效 session 绕过验证码
    sessionCookies: z.array(z.object({
      name: z.string(),
      value: z.string(),
      domain: z.string().optional(),
      path: z.string().optional().default('/'),
    })).optional()
      .describe('预置的有效鉴权 Cookie 数组，注入后直接空降到目标页，绕开图形验证码'),
    
    // 表单字段选择器映射（银行系统常见字段名各异）
    fieldSelectors: z.object({
      username: z.string().optional().default('#username'),
      password: z.string().optional().default('#password'),
      submitButton: z.string().optional().default('button[type="submit"]'),
    }).optional()
      .describe('表单登录字段的 CSS 选择器映射'),
  }).optional()
    .describe('目标系统的准入鉴权配置'),

  waitForSelector: z.string().optional()
    .describe('等待某个 CSS 选择器出现后再开始抓取（用于 SPA 异步渲染场景），如 ".main-content"'),

  waitTimeout: z.number().optional().default(15000)
    .describe('页面加载等待超时毫秒数，默认 15 秒'),
})
```

**返回值结构**:

```ts
{
  status: "SUCCESS" | "LOGIN_FAILED" | "TIMEOUT" | "NAVIGATION_ERROR",
  currentUrl: string,                    // 最终停留的 URL
  pageTitle: string,                     // 页面标题
  scrapedTexts: string[],                // 页面上所有可见文本片段（去重去空）
  visibleElements: Array<{
    tag: string,                         // 标签名（input, button, label, span, etc.）
    text: string,                        // 元素文本内容
    selector: string,                    // 简要 CSS 选择器路径
    attributes: Record<string, string>,  // 关键属性（id, name, placeholder, type 等）
  }>,
  interactiveElements: Array<{
    tag: string,                         // button, a, input, select
    text: string,
    type: string,                        // button/submit/link/input
    selector: string,
  }>,
  executionTime: number,                 // 执行耗时（毫秒）
}
```

**安全约束**:
- URL 白名单校验（仅允许 http/https，禁止 file://、内网 IP 段可由环境变量 `AURA_PLAYWRIGHT_ALLOWED_DOMAINS` 控制）
- 执行超时 60 秒硬截断
- 浏览器进程强制 kill（防止僵尸进程泄漏）
- 禁用下载、弹窗、地理位置等敏感 API

**实现架构**:

```
execute_playwright_validation({ targetUrl, authConfig, waitForSelector })
  │
  ├─ 1. URL 安全校验
  │     └─ 校验协议 (http/https only) + 域名白名单
  │
  ├─ 2. 启动 Playwright Chromium 无头模式
  │     └─ chromium.launch({ headless: true })
  │
  ├─ 3. 创建 BrowserContext（隔离会话）
  │     └─ 若 mode=COOKIE_INJECTION → context.addCookies(cookies)
  │
  ├─ 4. 鉴权流程
  │     ├─ NONE          → 直接 goto(targetUrl)
  │     ├─ COOKIE_INJECTION → 注入 Cookie → goto(targetUrl)
  │     └─ FORM_LOGIN    → goto(loginUrl) → fill(username) → fill(password) → click(submit) → 等待跳转 → goto(targetUrl)
  │
  ├─ 5. 等待页面就绪
  │     └─ waitForSelector? 或 waitForLoadState('networkidle')
  │
  ├─ 6. 抓取页面数据
  │     ├─ page.url()          → currentUrl
  │     ├─ page.title()        → pageTitle
  │     ├─ page.evaluate()     → 提取所有可见文本与交互元素
  │     └─ page.content()      → 可选：完整 HTML（用于存档）
  │
  ├─ 7. 清理资源
  │     └─ browser.close() → 强制关闭，防止进程泄漏
  │
  └─ 8. 返回结构化结果
```

---

### 工具二：`save_ui_audit_report`（便利工具）

**分类**: `asset-output`

**功能**: 接收 Agent 在 CoT 中完成的语义比对结果，格式化为银行合规审计报告，写入工作空间。同时也生成结构化差异 JSON 供下游工具消费。

**参数 Schema**:

```ts
parameters: z.object({
  reportTitle: z.string()
    .describe('审计报告标题，如 "转账确认页 UI 原型契约校验报告"'),
  
  targetEnv: z.string()
    .describe('测试环境标识，如 "网银 UAT-02"'),
  
  specSource: z.string()
    .describe('原型契约来源，如 "inputs/ui-specs/01_转账确认页_原型要素.json"'),
  
  overallVerdict: z.enum(['PASSED', 'FAILED', 'WARNING'])
    .describe('整体审计结论'),
  
  textElements: z.array(z.object({
    expectedText: z.string().describe('原型要求的文本（如按钮文案、标签文字）'),
    elementType: z.enum(['label', 'button', 'input_placeholder', 'heading', 'validation_message', 'link'])
      .describe('元素类型'),
    actualText: z.string().optional().describe('页面上实际抓取到的文本'),
    status: z.enum(['MATCHED', 'MISSING', 'TEXT_MISMATCH'])
      .describe('比对状态'),
    severity: z.enum(['Low', 'Medium', 'Blocker'])
      .describe('风险等级'),
    comment: z.string().optional()
      .describe('审计意见'),
  })).describe('文本要素比对清单'),
  
  routeValidation: z.object({
    expectedRoute: z.string().describe('设计文档中的预期路由'),
    actualRoute: z.string().describe('浏览器实际所在的 URL'),
    isMatch: z.boolean().describe('路由是否匹配'),
    comment: z.string().optional(),
  }).optional().describe('路由合规性校验结果'),
  
  interactiveElements: z.array(z.object({
    elementType: z.enum(['button', 'link', 'input', 'select', 'modal_trigger']),
    expectedLabel: z.string(),
    actualLabel: z.string().optional(),
    status: z.enum(['MATCHED', 'MISSING', 'TEXT_MISMATCH']),
  })).optional().describe('交互元素校验结果（按钮、链接等可操作组件）'),
})
```

**输出文件**:
- `outputs/ui-test/01_UI界面合规性比对报告.md` — 面向测试经理/产品经理的可读审计报告
- `outputs/ui-test/02_UI审计差异明细.json` — 结构化差异数据，供下游自动化流水线消费
- `outputs/ui-test/ui_playwright_script.spec.js` — 可复用的 Playwright 脚本（Agent 生成后用 write_text_file 写入）

---

## 五、System Prompt 设计

### 5.1 结构概览

```
┌──────────────────────────────────────────────┐
│ 1. 角色定义 (Role & Identity)                │
│    - UI 原型契约审计与自动化校验专家           │
│    - 精通银行 UI 合规标准与 DOM 文本比对       │
├──────────────────────────────────────────────┤
│ 2. 核心职责 (Core Responsibilities)          │
│    - 要素解析、无头抓取、语义比对、路由校验    │
├──────────────────────────────────────────────┤
│ 3. UI 审计方法论 (Audit Methodology)         │
│    - 文本要素比对规则                         │
│    - 交互元素校验规则                         │
│    - 路由合规性校验                           │
├──────────────────────────────────────────────┤
│ 4. 工作红线 (Red Lines)                      │
│    - 银行合规红线（安全提示文本、资损风险文案）│
│    - 不能只比对数量，必须比对语义             │
├──────────────────────────────────────────────┤
│ 5. 工作流程 (Workflow)                       │
│    - 4 步管道：解析契约 → 沙箱抓取 → 交叉比对 → 固化报告 │
├──────────────────────────────────────────────┤
│ 6. 输出规范 (Output Specification)           │
│    - Markdown 审计报告模板                    │
│    - JSON 差异明细 Schema                     │
├──────────────────────────────────────────────┤
│ 7. 环境配置 (Environment Config)             │
│    - env_profile.json 读取规则               │
│    - Cookie/登录凭证使用规范                   │
├──────────────────────────────────────────────┤
│ 8. 可用工具 (Available Tools)                │
│    - execute_playwright_validation           │
│    - save_ui_audit_report                    │
│    - 通用文件读写工具                         │
└──────────────────────────────────────────────┘
```

### 5.2 文本要素比对规则（嵌入 Prompt）

Agent 在比对"期望文本"与"实际文本"时遵循以下规则：

| 比对维度 | 严格模式 | 宽松模式（默认） |
|---------|:---:|:---:|
| 完全匹配 | `"付款账号"` = `"付款账号"` → MATCHED | 同左 |
| 去空格匹配 | `"付款账号"` ≠ `"付 款 账 号"` → MISMATCH | `"付 款 账 号"` → trim 后 MATCHED |
| 语义等价 | `"确认转账"` ≠ `"确认提交"` → MISMATCH | 银行场景默认严格模式 |
| 子串包含 | — | `"请输入起存金额"` 包含 `"起存金额"` → MATCHED (子串匹配) |
| 缺失 | 原型有但页面完全没有 → MISSING | 同左 |

**银行合规红线（严格模式）**:
- 安全提示文本（如"交易发生资损风险提示"）必须逐字匹配
- 法律责任声明文本必须完整呈现
- 金额、利率等数字必须完全一致（含小数位数）

### 5.3 工作流程（4 步管道）

**第一步：扫描输入资产 (1 min)**
- 使用 `list_directory` 扫描 `inputs/ui-specs/` 目录
- 使用 `read_file_full` 读取原型 JSON 文件，提取页面准入元素清单
- 如果存在 `env_profile.json`，读取环境配置（base_url、鉴权策略、Cookies）

**第二步：驱动沙箱执行 (2-3 min)**
- 调用 `execute_playwright_validation`，传入目标 URL 和鉴权配置
- 工具自动完成浏览器启动 → 鉴权 → 页面加载 → DOM 抓取
- 获取返回的 `scrapedTexts`、`currentUrl`、`visibleElements`

**第三步：语义交叉比对 (2 min)**
- 将原型 JSON 中的 `required_elements` 与实际抓取的 `scrapedTexts` 逐一比对
- 标记每条要素的状态：MATCHED / MISSING / TEXT_MISMATCH
- 判定风险等级（Blocker=银行合规红线缺失, Medium=文案不一致, Low=非关键文案差异）
- 校验 `currentRoute` 与预期路由的一致性

**第四步：成果固化落地 (1 min)**
- 调用 `save_ui_audit_report` 将比对结果格式化为审计报告
- 可选：使用 `write_text_file` 将自动生成的 Playwright 脚本保存为 `ui_playwright_script.spec.js`，供测试人员复用

---

## 六、数据库变更

### 无需数据库迁移

本场景不需要新增数据库表或字段。`scene_definitions` 表结构已完整支持。

---

## 七、前端适配

### 无需前端改动

`ScenesSection` 组件从 `/api/scenes` 动态拉取场景列表，新增的 seed 数据会自动出现在能力中心页面，无需前端改动。

---

## 八、文件变更清单

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `web-aura-next/package.json` | 修改 | 添加 `playwright` 依赖 |
| 2 | `web-aura-next/src/lib/agent/tools/execute-playwright-validation.ts` | **新增** | Playwright 无头浏览器 DOM 抓取工具 |
| 3 | `web-aura-next/src/lib/agent/tools/save-ui-audit-report.ts` | **新增** | UI 审计报告格式化与保存工具 |
| 4 | `web-aura-next/src/lib/agent/tools/index.ts` | 修改 | 导出 2 个新工具 |
| 5 | `web-aura-next/src/lib/agent/tool-registry.ts` | 修改 | 注册 2 个新工具的元数据 + 新增 `browser-automation` 分类 |
| 6 | `web-aura-next/src/app/api/chat/route.ts` | 修改 | 导入新工具，场景挂载逻辑 |
| 7 | `web-aura-next/src/lib/db/seed/scenes.ts` | 修改 | 新增 `BANK_UI_VALIDATOR_SCENE` 配置 |
| 8 | `web-aura-next/src/lib/agent/capabilities-data.ts` | 修改 | 更新场景数量描述（6→7） |
| 9 | `docs/UI原型契约与自动化校验专家场景实施计划.md` | 新增 | 本计划文档（留存档） |

**总计**: 9 个文件变更（3 新增 + 6 修改）

---

## 九、实施步骤

```
Step 1: 编写本计划文档并留存 docs/ 目录    ✅ 当前步骤
Step 2: 安装 playwright 依赖 (npm install playwright)
Step 3: 实现 execute_playwright_validation 工具
Step 4: 实现 save_ui_audit_report 工具
Step 5: 注册新工具（tool-registry.ts + tools/index.ts）
Step 6: 修改 scenes.ts，新增场景种子数据（含完整 System Prompt）
Step 7: 更新 chat/route.ts 场景工具挂载逻辑
Step 8: 更新 capabilities-data.ts 场景数量描述
Step 9: 本地验证（启动应用，确认场景出现在能力中心 + 端到端测试）
```

---

## 十、风险与注意事项

### 10.1 Playwright 依赖

- **浏览器二进制**: `playwright` 安装时会自动下载 Chromium（~170MB），需确保服务器磁盘空间充足
- **系统依赖**: Linux 服务器需安装 Chromium 系统依赖库（`libnss3`, `libnspr4`, `libatk-1.0-0` 等），可通过 `npx playwright install-deps` 一键安装
- **轻量替代**: 若服务器环境受限，可考虑安装 `playwright-core` + 单独的 `chromium` 包，减少体积

### 10.2 安全边界

- **URL 白名单**: 工具必须校验目标 URL，防止 Agent 被 Prompt 注入操控去攻击内网系统（SSRF）
- **浏览器沙箱**: Chromium 默认启用 sandbox，但 Docker 容器中可能需要 `--no-sandbox`（需评估安全风险）
- **凭证安全**: Cookie/密码通过工具参数传入，仅在内存中使用，不落盘

### 10.3 场景边界

- **仅比对本界面要素**: 当前场景聚焦单页面的文本/路由校验，不涉及多步骤操作流程（如"点击A→跳转B→填写C→提交"），后者属于 E2E 测试场景，可在后续迭代中增强
- **视觉回归不在范围内**: 不比对颜色、字体、布局等视觉样式，仅比对文本内容和路由，符合 PRD 定位
- **验证码无法自动处理**: 银行系统常见的图形验证码、短信验证码等需要预置 Cookie 或测试环境关闭验证码

### 10.4 Token 消耗

- System Prompt 约 +2000 tokens/次（含 UI 审计方法论 + 比对规则 + 报告模板）
- `execute_playwright_validation` 返回的 DOM 数据可能较大（银行页面通常 100-500 个可见文本节点），估算 1K-10K tokens/次
- 总计每次审计约 10K-20K tokens（含 Agent CoT 输出），低于功能点估算专家（需逐一分析 DET/RET）

### 10.5 后续迭代方向

- **多步骤操作流程**: 支持 Playwright 脚本录制回放，覆盖"登录→导航→填写→提交"完整链路
- **截图对比**: 接入视觉模型（GPT-4V/Claude Vision）进行像素级 UI 对比
- **定时巡检**: Cron 定时触发 UI 审计，自动对比生产/测试环境
- **原型格式扩展**: 支持直接读取 Figma API / Axure 导出文件，跳过手工 JSON 导出步骤
- **自定义校验规则**: 支持 YAML/JSON 格式的校验规则配置，不同项目定义不同红线
