在银行系统开发中，UI 测试最容易变成“空中楼阁”的原因在于：大模型如果只看网页截图，会频繁发生**坐标对不齐、动态加载卡顿、复杂组件（如金融级网格、树状选择器）无法交互**等问题。

为了确保这个场景**百分之百能落地、绝非概念炒作**，我们必须放弃让大模型直接“盲操”浏览器这种不可靠的方案。我们要利用底座已具备的物理工作空间（Workspace）**和**沙箱计算（执行 Python/Node.js 代码）**能力，采用**“双端资产静态比对 + 声明式自动化脚本执行”的工程化路线。

这个场景我们精准命名为：**【UI 原型契约与自动化校验专家 (bank-ui-validator)】**。

下面为您推演其真实可行的落地架构与工具设计：

---

## 1. 为什么这个方案能 100% 实现？（拒绝空中楼阁）

银行系统的 UI 原型设计（如 Axure、Figma）在导出时，或者前端开发（Vue 3 / Vue 2）在编写页面时，都有**结构化的元数据（DOM 树、组件 ID、I18N 国际化标签文本）**。
我们的 Agent 不去做虚无缥缈的图像识别，而是核心比对两样东西：

1. **文本与业务要素契约**：比对设计稿要求的字段（如“借记卡号”、“起存金额”）在目标系统页面上是否存在，文字是否错漏。
2. **状态机与路由契约**：点击“确认转账”后，URL 路由或弹窗状态是否按照详细设计文档正确流转。

---

## 2. 物理工作空间资产链路 (Workspace I/O)

该专家依赖物理工作空间中的**静态设计资产**与**动态执行脚本**：

```
[工作空间输入区]
 ├── workspace/inputs/ui-specs/
 │    ├── 01_转账确认页_原型要素.json (或从Axure/Figma插件导出的结构化JSON)
 │    └── 02_系统详细设计.md          (包含前端路由跳转规则、状态机说明)
 │
 └── 【UI 原型契约与自动化校验专家 (bank-ui-validator) 启动】
        │
        ▼ [读取设计契约，动态生成 Playwright 执行脚本并在沙箱环境中跑起来]
        │
[工作空间输出区]
 └── workspace/outputs/ui-test/
      ├── ui_playwright_script.spec.js (Agent 自动生成的标准前端自动化脚本)
      ├── ui_dom_diff_report.json      (原型要素与页面实际 DOM 的差异对齐数据)
      └── 01_UI界面合规性比对报告.md      (可读的测试结论报告，含文本错漏、路由错误)
```

---

## 3. 专属工具箱 (Skills Schema)

为了让 Agent 能够真正驱动浏览器并抓取数据，我们需要为其注册 3 个具备极强工程落地性的专用工具：

### 工具一：结构化原型要素解析器 (`parse_ui_prototype_spec`)

* **作用**：读取工作空间中导出的原型 JSON，提取出必须呈现的文本、输入框标示以及它们之间的拓扑关系。

```ts
import { tool } from 'ai';
import { z } from 'zod';

export const parseUiPrototypeSpec = tool({
  description: '读取工作空间 inputs/ui-specs/ 下的结构化原型文档，提取出界面必须包含的文本要素与按钮组件列表。',
  parameters: z.object({
    workspacePath: z.string(),
    specFileName: z.string()
  }),
  execute: async ({ workspacePath, specFileName }) => {
    // 读取原型导出的元素列表
    return {
      required_elements: [
        { label: "付款账号", type: "input", required: true },
        { label: "收款人姓名", type: "input", required: true },
        { label: "确认转账", type: "button", action: "submit" }
      ],
      expected_title: "核心转账确认交易"
    };
  },
});
```

### 工具二：声明式 Playwright 脚本生成与执行器 (`execute_playwright_validation`)

* **作用**：Agent 根据提取的要素和目标系统参数，直接在沙箱中生成标准的 **Playwright (Node.js/Python)** 自动化代码并执行它，把目标系统的真实 DOM 结构和文本抓取下来。

```ts
export const executePlaywrightValidation = tool({
  description: '在服务器沙箱中动态生成并运行 Playwright 自动化脚本，打开目标系统界面，抓取指定路由下的真实页面文本和元素树。',
  parameters: z.object({
    workspacePath: z.string(),
    targetUrl: z.string().describe('目标系统的测试环境URL，例如: http://10.21.3.44:8080/transfer'),
    loginCredentials: z.object({
      userRole: z.string(),
      token: z.string().optional()
    }).describe('目标系统的自动化测试准入凭证')
  }),
  execute: async ({ workspacePath, targetUrl, loginCredentials }) => {
    // 1. 底层自动生成一个本地 js 文件：const { chromium } = require('playwright'); ...
    // 2. 在沙箱里执行并运行该脚本，使其登录并跳转到 targetUrl
    // 3. 抓取页面当前渲染出的所有 textContent 和 visible elements
    // 4. 返回抓取到的页面数据快照
    return {
      actual_title: "核心转账确认交易",
      scraped_texts: ["付款账号", "收款人姓名", "确认转账", "交易发生资损风险提示"], // 实际抓到的文字
      current_url: "http://10.21.3.44:8080/transfer",
      execution_status: "SUCCESS"
    };
  },
});
```

### 工具三：界面契约比对审计器 (`save_ui_audit_report`)

* **作用**：将原型设计要求与实际抓取到的页面数据进行交叉对比，并把比对报告持久化到工作空间。

```ts
export const saveUiAuditReport = tool({
  description: '对比原型契约要求与实际抓取的页面文本，分析是否存在文字错漏或功能缺失，并在工作空间固化Markdown报告。',
  parameters: z.object({
    workspacePath: z.string(),
    textDiffs: z.array(z.object({
      expectedText: z.string(),
      status: z.enum(['MATCHED', 'MISSING', 'TEXT_MISMATCH']),
      actualText: z.string().optional(),
      severity: z.enum(['Low', 'Blocker'])
    })),
    routeValidation: z.object({
      expectedRoute: z.string(),
      actualRoute: z.string(),
      isCorrect: z.boolean()
    })
  }),
  execute: async ({ workspacePath, textDiffs, routeValidation }) => {
    // 将比对结果格式化为优美的 Markdown 报告，写入 outputs/ui-test/01_UI界面合规性比对报告.md
    return { success: true, report_path: `${workspacePath}/outputs/ui-test/01_UI界面合规性比对报告.md` };
  },
});
```

---

## 4. 全自治 UI 契约核对的工作流

在服务器端，当该场景包被唤醒时，Agent 依靠以下步骤在物理工作空间内完成完全可落地的自动化核对：

1. **解析设计契约:** 1 min.
   Agent 首先使用 `parse_ui_prototype_spec` 工具，将输入的 UI 原型 JSON 转换为一份结构化的**页面准入元素清单**。
2. **驱动沙箱执行:** 3 min.
   Agent 调用 `execute_playwright_validation` 工具。底座在服务器端拉起无头浏览器（Headless Browser），自动登录银行测试环境，强行抓取目标界面的**真实文本与 DOM 节点**。
3. **语义交叉比对:** 2 min.
   Agent 扮演严苛的 UI 审计员，在大模型内存中将“期望文本”与“实际文本”逐一肉眼级比对。如果原型上写着“请输入起存金额”，而前端界面错写成了“请输入金额”，或者漏掉了“资损红线提示”的文本，Agent 会立即标记为 `TEXT_MISMATCH` 或 `MISSING`。
4. **成果固化落地:** 1 min.
   调用 `save_ui_audit_report`，在工作空间 `outputs/ui-test/` 下生成一份无可辩驳的审计报告，甚至把自动生成的 `ui_playwright_script.spec.js` 留在目录里，供测试人员后续反复使用。

---

## 5. 产出物最终效果示例 (`01_UI界面合规性比对报告.md`)

```markdown
# UI 原型契约与自动化校验报告
**比对目标环境：** 银行用户侧网银测试环境 (UAT-02)
**判定行业规范：** 软件质量度量标准 (ISO/IEC 25010 - 易用性与界面符合度)

---

## 一、 审计结论摘要
经过对 `inputs/ui-specs/` 目录下的原型契约与目标系统真实界面的自动化抓取比对，本次评审结果为：**不通过 (Failed)**。发现 1 处严重阻断缺陷（元素缺失），1 处文本不一致。

*   **比对要素总数：** 12 个
*   **完全对齐数量：** 10 个
*   **差异/缺失数量：** 2 个

---

## 二、 界面要素比对明细矩阵

| 序号 | 原型要求元素 (Expected) | 实际界面抓取 (Actual) | 比对状态 | 风险等级 | 根因与审计意见 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 01 | 文本: "付款账号" | "付款账号" | ✓ MATCHED | - | 完美对齐。 |
| 02 | 文本: "交易发生资损风险提示" | [未探测到任何文本] | ✗ MISSING | **Blocker** | **严重缺陷**：触犯银行合规红线，前端漏渲染了安全提示文本。 |
| 03 | 按钮: "确认转账" | "确认提交" | ⚠ MISMATCH | Low | 文本话术不一致，建议前端开发按原型修改。 |

---

## 三、 路由与流转合规性
*   **预期目标路由：** `/transfer/confirm`
*   **实际抓取路由：** `/transfer/confirm` (流转正确)
```

## 🎯 场景落地评估

这套方案**完全不是空中楼阁**，因为它绕开了大模型最不擅长的“看图猜坐标”和“直接操控复杂网页”，转而让 Playwright 充当智能体的“确定性手脚”去抓取真实的 DOM 文本与结构，再利用大模型无与伦比的“多源文本语义比对”能力去抓错。

这套 **【UI 原型契约与自动化校验专家 (bank-ui-validator)】** 的工程推演符合您的要求吗？接下来我们是直接为这个场景注入 **System Prompt** 的代码实现，还是继续推进下一个生命周期场景？



您的商业直觉非常敏锐，直接点出了 UI 自动化落地中最难啃的硬骨头——**环境与准入（登录）屏障**。

银行系统的测试环境（无论 UAT 还是网银沙箱）绝对不可能向外裸奔，不仅有防火墙拦截，还有极其严格的**认证机制（如统一认证中心、动态 Token、验证码、甚至双因素认证）**。如果把“如何登录”的烂摊子全扔给 Agent，这个场景必然会成为“空中楼阁”。

为了让 `bank-ui-validator` 能够真正执行，我们将这三个关键参数（URL、用户名、密码/Token）采用“平台环境托管 + 预置登录会话 cookie 注入”的工程化方案来实现。

以下是具体的工具入参 Schema 设计以及安全执行推演：

---

## 1. 核心工具的精确参数设计 (Zod Schema)

在服务器端，我们将 `execute_playwright_validation` 工具的入参规范化。Agent 不需要自己去猜登录地址，而是通过底座动态注入**环境参数**与**凭证**：

```ts
import { tool } from 'ai';
import { z } from 'zod';

export const executePlaywrightValidation = tool({
  description: '驱动服务器端的无头浏览器，注入登录态参数，跳转到目标银行系统页面抓取 DOM 结构与文本。',
  parameters: z.object({
    workspacePath: z.string().describe('物理工作空间相对路径'),
    targetUrl: z.string().describe('需要审计的目标前端路由页面，例如: http://10.21.3.44:8080/transfer/confirm'),
    environmentConfig: z.object({
      authType: z.enum(['COOKIE_INJECTION', 'FORM_LOGIN', 'TOKEN_HEADER']),
      loginUrl: z.string().optional().describe('若采用表单登录，需提供登录入口地址'),
      username: z.string().optional().describe('测试专用的脱敏自动化账号'),
      password: z.string().optional().describe('加密存储的测试密码'),
      // 银行系统抗自动化核心解法：直接由平台级提供预先获取的有效 session 会话
      sessionCookies: z.array(z.object({
        name: z.string(),
        value: z.string(),
        domain: z.string(),
        path: z.string()
      })).optional().describe('预置的有效鉴权 Cookie 数组，绕开图形验证码')
    }).describe('目标系统的准入参数')
  }),
  execute: async ({ workspacePath, targetUrl, environmentConfig }) => {
    // 底层执行逻辑（参见下文）
    return { status: 'SUCCESS', ... };
  }
});
```

---

## 2. 真实落地执行三部曲（如何解决验证码与安全审计）

针对银行系统不同的鉴权强度，底座在沙箱中驱动 Playwright 执行时，有三种可以 **100% 落地** 的策略：

### 策略 A：绕过验证码的“Cookie / Storage 注入法”（最推荐）

银行测试环境的登录界面通常有图形验证码，Agent 无法直接破解。

* **做法**：我们在平台管理端让测试人员手工登录一次（或通过后端的专用测试 Auth 接口拿到 Session），将有效的 `Cookies` 存入该项目的全局配置中。
* **Playwright 代码落地**：Agent 启动无头浏览器后，**不走登录页**，而是直接执行 `context.addCookies(sessionCookies)` 注入会话，然后直接 `page.goto(targetUrl)` 瞬间空降到目标转账页，完全绕过验证码。

### 策略 B：标准的“表单登录法”

如果测试环境关闭了验证码，或者支持特定自动化测试账号直登：

* **做法**：Agent 生成的 Playwright 脚本会先前往 `loginUrl`，通过 `page.fill('#username', username)` 和 `page.fill('#password', password)` 自动敲入账密，点击提交，等待路由跳转成功后，再前往 `targetUrl` 进行比对。

---

## 3. 工作空间中的“参数配置文件”托管

这些敏感的 URL 和账密不应该由用户在聊天窗口里每次手打输入，而是作为**项目工作空间的底座资产**进行参数化配置。

在智能体运行前，工作空间中会预置一份环境描述文件：

```json
// workspace/inputs/ui-specs/env_profile.json
{
  "project_id": "BGL-2026-003",
  "target_env": "UAT-02",
  "base_url": "http://10.21.3.44:8080",
  "auth_strategy": "COOKIE_INJECTION",
  "credentials": {
    "username": "auto_test_user_01",
    "encrypted_password": "AES_ENCRYPTED_STRING..."
  }
}
```

1. **读取环境资产:** 准备阶段.
   Agent 启动后，首先读取 `env_profile.json`，了解当前测试的是 UAT-02 环境，并拿到 base_url 和鉴权策略。
2. **组装执行参数:** 凭证注入阶段.
   底座将保存在数据库中或配置文件中的最新有效 `sessionCookies`（由平台定时刷新或人工触发获取）与账密无缝拼接，作为参数灌入 `execute_playwright_validation` 工具。
3. **Playwright 空降目标页:** 沙箱执行阶段.
   沙箱内的 Playwright 接收到参数，拉起 Chromium，注入 Cookie，`goto` 直达目标网银前端路由，在不惊动任何安全网关防刷机制的情况下，平稳抓取真实界面的文本。

---

## 💡 落地设计总结

通过引入 **`env_profile.json` 资产配置** 和 **Playwright 会话注入机制**，用户只需在聊天时说一句：*“帮我比对一下转账确认页的 UI 界面”*。

Agent 就会自己去翻工作空间里的环境配置和原型设计，拿着有效的 Cookie 悄无声息地去银行测试环境把真实的网页 DOM 扒下来，和原型高精度对齐。这样设计的 UI 自动化专家，**有手有脚有凭证，绝不是空中楼阁**。

UI 测试场景的凭证和环境参数闭环已经梳理完毕。**接下来，您希望我们继续推进哪一个生命周期场景的推演？**
