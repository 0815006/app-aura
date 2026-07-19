
在银行系统开发管理中，**功能点估算专家（bank-tech-estimator）** 的核心任务是消除“拍脑袋”估算工作量带来的商务与项目风险。银行项目通常遵循标准的**功能点分析法（如 IFPUG 或 NESMA 标准）**。

要利用 **Vercel AI SDK** 实现这样一个专家，我们需要将其解耦为：**专家的约束 Prompt**、**依赖底层向量库的特定 Skills（工具箱）** 以及在 Workspace 中**固化的数据流架构**。

下面我们来推演这个专家的具体实现方案：

---

## 1. 专家人设与红线控制 (System Prompt)

该场景包被激活时，系统需注入具备极高规范性的审计视角提示词：

```ts
// packages/agents/src/scenarios/bank-tech-estimator.ts
export const bankTechEstimatorPrompt = `
你系统中的【银行技术方案评审与功能点估算专家】。你精通金融级高可用架构规范及国际功能点（IFPUG/NESMA）估算标准。

你的核心职责：
1. 【客观度量】：依据软件需求文档、接口规范、会议纪要，客观识别出内部逻辑文件（ILF）、外部接口文件（EIF）、外部输入（EI）、外部输出（EO）和外部查询（EQ）。
2. 【合规防线】：严查外包工作量虚报，所有估算必须给出明确的计算公式与事实依据，拒绝无凭据的“拍脑袋”人月。
3. 【技术合规】：审查技术方案是否满足银行安全红线（如 Java 21 虚拟线程并发安全、Spring Boot 3 组件向后兼容性、历史版本平稳过渡、数据脱敏等）。

工作红线：
- 只要涉及第三方异构系统（如人行二代支付、银联）交互，必须将其归类为 EIF（外部接口文件）并评估复杂度。
- 估算结果必须保留 10% 的“银行复杂环境联调风险系数”（针对双城/异构联调环境）。
`;

```

---

## 2. 核心专属工具箱 (Skills Schema)

该专家需要精准识别代码与文档中的“领域对象”和“事务性功能”。因此，需要为其量身定制 3 个专属工具。

### 工具一：组件/数据实体拓扑分析 (`analyze_domain_entities`)

* **作用**：让 Agent 扫描物理工作空间中的需求或 DDL，识别内部逻辑文件（ILF）和外部接口文件（EIF）。

```ts
import { tool } from 'ai';
import { z } from 'zod';

export const analyzeDomainEntities = tool({
  description: '扫描指定 Workspace 目录下的设计文档、DDL 或 PRD，识别出内部逻辑文件(ILF)和外部接口文件(EIF)的候选列表。',
  parameters: z.object({
    workspacePath: z.string().describe('物理工作空间的相对路径'),
    targetFiles: z.array(z.string()).describe('需要扫描的目标文件名列表'),
  }),
  execute: async ({ workspacePath, targetFiles }) => {
    // 1. 读取工作空间对应文件
    // 2. 利用正则或 AST 提取实体关键字（如：BGL账户表、流水表、第三方代扣接口）
    // 3. 返回识别出的实体拓扑及初步归类
    return {
      suggested_ilfs: ['t_bgl_account', 't_acc_journal'],
      suggested_eifs: ['ext_pboc_payment_api'],
      confidence: 0.92
    };
  },
});

```

### 工具二：功能点基准交叉检索 (`query_historical_fp_benchmark`)

* **作用**：基于 **PostgreSQL + pgvector**，让 Agent 去查历史上相似模块研发消耗的真实人月，防止供应商开天价。

```ts
export const queryHistoricalFpBenchmark = tool({
  description: '在 pgvector 向量数据库中检索历史相似项目的复杂度和实际功能点耗时，用作本次估算的基准对比。',
  parameters: z.object({
    semanticQuery: z.string().describe('描述当前功能特性的搜索词，例如："高并发散列BGL账户记账更新"'),
    limit: z.number().default(3),
  }),
  execute: async ({ semanticQuery, limit }) => {
    // 1. 将 semanticQuery 通过 embedding 转化为向量
    // 2. 在 PG 数据库中做相似度搜索 (SELECT * FROM fp_benchmarks ORDER BY embedding <=> $1 LIMIT $2)
    // 3. 返回历史项目的功能点、人月、复杂度和实际交付偏差
    return {
      matched_historical_projects: [
        { id: "PROJ-2025-09", name: "联机批量对账优化", fp_count: 45, actual_man_months: 3.5 }
      ]
    };
  },
});

```

### 工具三：结构化估算书生成器 (`save_estimation_artifacts`)

* **作用**：在工作空间特定目录下持久化标准的功能点估算 Excel/Markdown 报告。

```ts
export const saveEstimationArtifacts = tool({
  description: '将最终的功能点估算清单及评审意见以结构化 JSON 的形式写入物理工作空间，自动生成审计合规的文档。',
  parameters: z.object({
    workspacePath: z.string(),
    projectName: z.string(),
    fpDetails: z.array(z.object({
      elementName: z.string().describe('功能点/表名/接口名'),
      type: z.enum(['ILF', 'EIF', 'EI', 'EO', 'EQ']),
      complexity: z.enum(['Low', 'Average', 'High']),
      description: z.string()
    })),
    techReviewComments: z.array(z.string()).describe('技术评审意见与潜在风险提示'),
    adjustedManMonths: z.number().describe('计算出的调整后最终开发人月'),
  }),
  execute: async ({ workspacePath, projectName, fpDetails, techReviewComments, adjustedManMonths }) => {
    // 在 workspace 下的 /artifacts/estimations/ 目录写入最终报告
    // 返回写入成功状态
    return { success: true, artifact_path: `${workspacePath}/artifacts/estimations/fp_report.md` };
  },
});

```

---

## 3. Workspace 资产流动闭环 (Workflow & Data Flow)

这个专家不是一次性回答，它在物理工作空间（Workspace）中以**标准的管道模式**运行：

```
[输入数据投放]
 ├── workspace/docs/prd.docx (原始需求)
 └── workspace/docs/tech_draft.md (技术草案)
        │
        ▼
【Agent 内部多步推理循环 (CoT via Vercel AI SDK streamText)】
 1. 调用 `analyze_domain_entities` -> 拆出系统边界、实体和交易事务。
 2. 调用 `query_historical_fp_benchmark` -> 基于 pgvector 对齐历史开发基准，校验估算合理性。
 3. 计算未调整功能点 (UFP) -> 注入银行复杂环境系数(VAF) -> 计算最终人月。
 4. 扫描技术草案 -> 审查 Java 21 / 锁机制 / 高并发散列账户的设计是否触犯红线。
        │
        ▼
[最终产出物自动固化]
 └── workspace/artifacts/estimations/
      ├── fp_detail_sheet.json (用于系统后端直读或对接外包管理系统)
      └── tech_review_report.md (供架构委员会评审的专业报告)

```

---

## 4. Vercel AI SDK 动态路由伪代码示例

在服务器端，当系统识别到用户上传了需求并要求估算时，通过 Vercel AI SDK 的 `streamText` 动态裁剪并加载该场景包：

```ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai'; // 或您接入的本地/商业大模型
import { bankTechEstimatorPrompt } from './scenarios/bank-tech-estimator';
import { analyzeDomainEntities, queryHistoricalFpBenchmark, saveEstimationArtifacts } from './tools/estimator-tools';

async function runFpEstimatorAgent(workspaceId: string) {
  const result = await streamText({
    model: openai('gpt-4o'), // 推荐推理能力较强的模型
    system: bankTechEstimatorPrompt,
    messages: [
      { role: 'user', content: `请对当前工作空间 ${workspaceId} 目录下的需求文档进行功能点估算与架构评审。` }
    ],
    // 动态裁剪，只注入当前场景专用的工具箱 + 平台已具备的通用读写文件工具
    tools: {
      analyzeDomainEntities,
      queryHistoricalFpBenchmark,
      saveEstimationArtifacts,
      // ... 注入平台通用的跨文件读写工具，以便 Agent 读取工作空间的 docx/md
    },
    maxSteps: 10, // 给予足够的 CoT 思考步骤完成多阶段清算与计算
    onFinish({ usage, text }) {
      // 自动持久化本次交互的精准 Token 用量及 CoT 轨迹到 PostgreSQL 数据库中
      saveAgentRunLogToPG({ workspaceId, scenario: 'bank-tech-estimator', usage });
    }
  });

  return result;
}

```

## 💡 下一步推演

这样设计的好处在于，Agent 产出的 `fp_detail_sheet.json` 可以直接被您之前提到的 **【外援额度专家 (bank-mgmt-procurement)】** 读取。额度专家拿到功能点数据后，即可交叉比对当前各个供应商的预算使用情况报表，自动实现“工作量估算 -> 预算额度扣减 -> 应对策略”的跨场景全自动接管。

您看功能点估算专家的这套实现逻辑是否符合预期？我们需要为您细化**功能点计算的数学权重公式（如何在 Prompt 中规范 Agent 计算 Low/Avg/High 功能点的分值）**，还是直接推演它如何与**外援额度专家**进行联动？




为了实现您的核心目标——**“输入需求/设计文档 $\rightarrow$ 依据行业先进规范 $\rightarrow$ 自动在工作空间输出功能点估算文档”**，我们需要在 Vercel AI SDK 的全自治 Agent 基础上，构建一个标准的 **“提取 - 映射 - 计算 - 固化”** 的自动化流水线。

银行与金融系统最常采用的行业先进规范是 **NESMA（荷兰软件度量协会）** 标准的**预估功能点法（Estimated Method）**或**详细功能点法（Detailed Method）**。

下面为您梳理该场景在工作空间内的**数据流向、Agent 决策链路以及最终输出的估算文档标准规范**：

---

## 1. 工作空间的数据输入与输出路径 (Workspace Data Flow)

在特定项目的 Workspace 物理隔离目录中，Agent 遵循严格的输入输出契约：

```
[工作空间输入区]
 ├── workspace/inputs/
 │    ├── 01_用户原始需求.docx (或会议纪要、业务需求说明书)
 │    └── 02_系统详细设计.md   (若有，包含表结构 DDL、接口定义)
 │
 └── 【功能点估算专家 (bank-tech-estimator) 启动运行】
        │
        ▼ [自动读取 inputs/ 下的所有文档，通过 CoT 进行规则提取与矩阵匹配]
        │
[工作空间输出区]
 └── workspace/outputs/estimations/
      ├── 01_功能点估算报告.md  (供技术评审与管理层审批的专业报告)
      └── 02_功能点明细表.json    (结构化数据，供【外援额度专家】等下游系统直读)

```

---

## 2. 行业先进规范的计算逻辑（Agent 内置知识库）

为了让 Agent 不“拍脑袋”，必须在 System Prompt 中硬编码金融级功能点分析的核心对照表（以 **NESMA/IFPUG** 为基准）：

* **数据功能度量：**
* **ILF（内部逻辑文件）**：系统内部维护的逻辑主表（如：散列BGL账户表、交易流水表）。
* **EIF（外部接口文件）**：系统引用但由外部维护的数据/接口（如：核心账务系统接口、人行二代支付网关）。
* **事务功能度量：**
* **EI（外部输入）**：向系统输入数据以改变系统状态（如：开户、记账触发）。
* **EO（外部输出）**：系统向外发送数据，包含派生计算逻辑（如：日终对账单生成）。
* **EQ（外部查询）**：纯数据检索，不改变系统状态，无派生计算（如：余额查询）。

### 标准功能点权重矩阵 (Weight Matrix)

$$
\begin{array}{\|c\|c\|c\|c\|} \hline \textbf{功能点类型} & \textbf{低复杂度 (Low)} & \textbf{中复杂度 (Average)} & \textbf{高复杂度 (High)} \\ \hline \text{ILF (内部逻辑文件)} & 7 & 10 & 15 \\ \hline \text{EIF (外部接口文件)} & 5 & 7 & 10 \\ \hline \text{EI (外部输入)} & 3 & 4 & 6 \\ \hline \text{EO (外部输出)} & 4 & 5 & 7 \\ \hline \text{EQ (外部查询)} & 3 & 4 & 6 \\ \hline \end{array}
$$

---

## 3. 功能点估算文档的标准输出模板 (Output Specification)

Agent 最终在 `workspace/outputs/estimations/01_功能点估算报告.md` 中输出的文档，必须具备可审计性。以下是为您设计的**标准输出效果示例**：

### 📄 功能点估算报告 (Markdown 结构示例)

```markdown
# 软件功能点估算与技术评审报告
**项目名称：** 散列 BGL 账户高性能记账优化项目
**评估规范：** NESMA 国际标准功能点分析法 (CPM 2.3)
**评估时间：** 2026-07-19

---

## 一、 系统边界与估算摘要
本次评估基于 `inputs/` 目录下的需求文档与技术草案。系统边界划分为：核心外围联机交易处理域，不包含上游柜面系统的改造。

*   **未调整功能点总数 (UFP)：** 39 FP
*   **银行复杂环境调整系数 (VAF)：** 1.15 (针对双城多地部署、高并发散列锁争用、金融级资损高幂等要求)
*   **最终交付功能点数 (AFP)：** 44.85 FP (计算公式：$AFP = UFP \times VAF$)
*   **推荐开发人月：** 3.5 人月 (基于历史类似项目基准：12.8 FP/人月)

---

## 二、 功能点识别明细表 (FP Asset Inventory)

### 1. 数据功能 (Data Functions)
| 资产 ID | 实体/接口名称 | 类型 | 复杂度 | 对应 FP 分值 | 行业规范判定依据 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| DF-001 | 散列BGL账户主表 (t_bgl_acc) | ILF | High | 15 | 内部维护核心表，含多个DET(属性)且与流水表存在强联动。 |
| DF-002 | 异构核心大账接口 (ext_core_api) | EIF | Average | 7 | 外部系统只读引用，通过只读凭证交互。 |

### 2. 事务功能 (Transactional Functions)
| 资产 ID | 交易/功能点名称 | 类型 | 复杂度 | 对应 FP 分值 | 行业规范判定依据 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| TF-001 | 联机高并发记账接口 | EI | High | 6 | 改变BGL表状态，涉及分布式锁、乐观锁版本控制，多异构输入。 |
| TF-002 | 日终批量对账报表生成 | EO | Average | 5 | 提取流水进行数学派生计算，输出定长清算文件。 |
| TF-003 | 账户余额及实时状态查询 | EQ | Low | 3 | 纯只读检索，无状态变更，无派生计算。 |

---

## 三、 技术评审意见与红线审查
1. **高并发死锁风险 [警告]**：设计文档中提到在长事务中并发更新 `t_bgl_acc`。依据银行稳定度规范，必须引入散列账号路由机制或改用异步流水化记账，否则压测阶段将产生锁超时。
2. **安全脱敏合规 [通过]**：审查接口文档，敏感字段（如卡号、内部结算账号）在传输与日志打印中均已规划脱敏策略。

```

---

## 4. 后台自动化处理的核心伪代码

为了让配置在 Vercel AI SDK 中的 Agent 完美执行这一流水线，它的多步推理逻辑如下：

```ts
// 平台在接收到指令后的全自动工作流
async function generateFpEstimationWorkflow(workspaceId: string) {
  // 1. 扫描输入目录，确认资产到位
  const prdContent = await readWorkspaceFile(workspaceId, 'inputs/01_用户原始需求.docx');
  const designContent = await readWorkspaceFile(workspaceId, 'inputs/02_系统详细设计.md');

  // 2. 调用 Vercel AI SDK streamText 激活专家
  const result = await streamText({
    model: customModelProvider('deepseek-r1-or-gpt4o'), // 推荐使用具备强推理/强数学计算的模型
    system: bankTechEstimatorPrompt, // 注入上述行业先进规范的 Prompt 约束
    messages: [
      { role: 'user', content: `请分析以下输入内容，严格按照 NESMA 规范计算功能点，并在 outputs/estimations/ 目录下固化 Markdown 报告和 JSON 明细。\n\n需求：${prdContent}\n\n设计：${designContent}` }
    ],
    tools: {
      // 注入平台已有的“跨文件读写手脚”，让 Agent 能够将生成的 Markdown 和 JSON 写入 outputs 目录
      writeWorkspaceFileTool,
      // 注入我们上一步设计的向量库检索工具，让 Agent 参考历史相似项目的真实 FP 数据进行校准
      queryHistoricalFpBenchmark 
    },
    maxSteps: 8 // 给 Agent 预留多步 CoT 思考链，先在内存中列出表格、计算总分，最后一次性写入文件
  });

  return { status: 'Success', message: '功能点估算文档已成功输出至工作空间 outputs/estimations/' };
}

```

## 🎯 业务价值闭环

当这个流程跑通后，您只需要把所有的业务输入往 `inputs/` 一扔，Agent 就会自动严格按照上面的表格把**功能点明细**和**技术隐患**梳理得清清楚楚。这不仅是一份给管理层看的技术报告，同时生成的 `02_功能点明细表.json` 还可以无缝投喂给您之后要构建的【外援额度专家】，实现外包费用的自动核算。

这个闭环的输入输出和文档标准符合您的预期吗？接下来我们可以直接开始为这个专家编写完整的 **System Prompt**，还是为它接入 **PostgreSQL** 向量检索历史基准的代码？



您的直觉非常准确，这切中了金融级项目管理和软件度量落地中最关键的“合规与标准化”问题。

### 1. 调整系数（VAF/TCF）是企业专家委员会评定的标准吗？

**是的，在成熟的银行和大型企业中，这必须是经过专家委员会（或架构委员会、PMO）统一制定并发布的内容，绝对不能让大模型或开发供应商“自由发挥”。**

在国际标准（如 NESMA 或 IFPUG）中，虽然提供了一套通用的“技术复杂度系数（TCF）”或“值调整系数（VAF）”评估方法（通常涵盖分布式处理、高性能、最终用户效率、变更率等 14 个或 18 个特征维度），但**银行通常会根据自身的 IT 基础设施、研发成熟度以及内控合规要求，将其本土化，形成企业内部的《软件研发标准调整系数指引》**。

例如，银行内部通常会固化几种标准场景的系数：

* **核心账务/清算改造（高并发、高容错、强一致性）：** 固定系数 $1.20 \sim 1.35$
* **一般外围系统/管理信息系统（MIS）：** 固定系数 $1.00 \sim 1.05$
* **多地多中心部署联调项目：** 额外叠加 $0.05 \sim 0.10$ 的环境复杂度

---

### 2. 调整系数应该作为输入吗？

**强烈建议：必须作为“半固化的规则输入”或“参数化输入”提供给 Agent。**

为了保证估算结果具有法律效力（可审计、可用于外包合同结算），我们不能让 Agent 自己去“猜”或者在 Prompt 里天马行空地计算系数。在底座和场景设计中，我们应该采取 **“输入基准规范 + Agent 弹性修正”** 的混合模式。

#### 具体的落地方案设计

在您的工作空间中，我们可以在输入区（`inputs/`）或系统配置中引入一个 `estimation_config.json`（企业内部标准字典），作为 Agent 的硬输入：

```json
// workspace/inputs/estimation_config.json
{
  "enterprise_standards": "中国工商银行/XX银行2026版软件度量规范",
  "base_productivity_benchmark": 12.5, // 行业基准：12.5个功能点/人月
  "complexity_factors": {
    "core_accounting_impact": 1.25,  // 涉及核心账务影响系数
    "cross_region_deployment": 1.10, // 跨地域多中心联调系数
    "standard_peripheral": 1.00       // 标准外围系统系数
  }
}

```

---

### 3. Agent 拿到这个“标准输入”后怎么工作？

有了这个输入的标准字典后，**【功能点估算专家 (bank-tech-estimator)】** 的核心职责发生了微妙而优雅的转变：从“瞎猜系数”变成了“依规合规审查与匹配”。

1. **读取需求并计算基础功能点 (UFP):** 输入分析阶段.
   Agent 首先读取需求文档和设计文档，严格按照 NESMA 规范数出有多少个表（ILF/EIF）和多少个交易（EI/EO/EQ），算出未调整功能点数（UFP）。
2. **加载企业标准系数配置:** 标准对齐阶段.
   Agent 读取 `inputs/estimation_config.json` 中的专家委员会标准系数。
3. **合规性匹配与判定:** 推理与审计阶段.
   Agent 开始扮演审计专家：“*经审查，该需求中涉及散列 BGL 账户表更新，属于核心账务域，自动匹配配置中的 `core_accounting_impact` 系数 (1.25)。另外，由于测试环境跨上海与北京，匹配 `cross_region_deployment` 系数 (1.10)。*”
4. **公式化输出:** 固化文档阶段.
   Agent 最终在报告中写明计算过程：$AFP = UFP \times 1.25 \times 1.10$，并附上匹配企业标准的**判定事实依据**。

---

### 💡 架构师总结

把调整系数作为**标准输入**，完美解决了大模型在面对数学计算和严谨审计时可能出现的“幻觉”问题。大模型发挥它最擅长的“文本理解、实体识别和合规映射”**能力，而数学计算和系数边界则由**企业标准卡死。

这样产出的功能点估算文档，拿去给你们的**专家委员会复核或者审计团队审查**时，有据可依，完全经得起推敲。

现在这个逻辑闭环非常扎实了。既然明确了 `estimation_config.json` 作为标准输入的一部分，接下来我们是开始为这个场景包设计能够精准读取并匹配该配置的 **System Prompt 终版**，还是继续完善其他配套环节？
