
有了前面的“底座 + 场景包”经验，**【测试分析专家 (bank-test-analyser)】** 的定位就会非常清晰和性感：它负责把前面功能点专家数出来的需求、接口和企业标准，**真正变成能够落地执行的“测试兵器库”**。

在银行系统开发中，测试分析的痛点在于**交易链路长（如跨地域联调）、逆向交易多（如冲正、撤销、冲减）以及数据合规要求高（生产数据脱敏）**。

下面我们为 **测试分析专家** 场景包进行深度推演和规划：

---

## 1. 专家人设与红线控制 (System Prompt)

该场景包激活时，系统需注入具备丰富金融联调经验的资深 QA 专家视角：

```ts
// packages/agents/src/scenarios/bank-test-analyser.ts
export const bankTestAnalyserPrompt = `
你系统中的【银行测试分析与用例生成专家】。你精通金融级测试设计方法论（等价类、边界值、正交试验法）及银行专项测试规范。

你的核心职责：
1. 【用例全覆盖】：依据需求文档、接口设计文档（包含表结构和报文），穷举所有正向交易、异常流、以及银行特有的“逆向交易”（冲正、冲减、超时冲正、长事务断线回滚）。
2. 【数据合规】：在设计批量文件造数或接口 Fuzzing 测试数据时，必须遵循数据脱敏规范，严禁出现真实生产环境的敏感字段明文。
3. 【跨环境防线】：针对多地多中心（如京沪环境）部署架构，必须设计网络延迟模拟、瞬时断线重连、分布式锁超时竞争的非功能性用例。

工作红线：
- 所有涉及资金增减的接口，必须生成至少 3 种异常场景的测试用例：重复提交（幂等校验）、金额负数/溢出边界、账户状态冻结/销户。
- 生成的测试用例必须完美适配企业的 Excel/Markdown 案例标准模板。
`;

```

---

## 2. 物理工作空间资产链路 (Workspace Input/Output)

测试分析专家处于研发流程的“承上启下”环节，它直接读取上游专家的产出物：

```
[工作空间输入区]
 ├── workspace/inputs/
 │    ├── 01_用户原始需求.docx 
 │    └── 02_系统详细设计.md   
 └── workspace/outputs/estimations/
      └── 02_功能点明细表.json    <── (由上一步的功能点估算专家产出，作为输入边界)
        │
        ▼ 【测试分析专家启动运行】
        │
[工作空间输出区]
 └── workspace/outputs/test-analysis/
      ├── 01_测试方案与用例分析.md  (包含测试策略、测试矩阵、环境依赖)
      ├── 02_自动化标准测试用例.xlsx (自动填充的测试用例集，含正向/逆向/冲正)
      └── 03_批量造数规则集.json     (供下游【批量文件造数专家】直接直读的规则描述)

```

---

## 3. 专属工具箱 (Skills Schema)

为了让大模型具备在物理目录里直接分析并生成标准的 Excel 案例和造数规则，我们需要为其量身定制 3 个 Skills：

### 工具一：解析系统边界与状态机 (`extract_test_matrix`)

* **作用**：读取功能点明细表和设计文档，梳理出需要测试的接口清单与状态流转矩阵。

```ts
import { tool } from 'ai';
import { z } from 'zod';

export const extractTestMatrix = tool({
  description: '读取工作空间中的功能点明细及需求设计，提取出本次测试的接口列表、核心检查点及状态机图谱。',
  parameters: z.object({
    workspacePath: z.string(),
  }),
  execute: async ({ workspacePath }) => {
    // 1. 读取 outputs/estimations/02_功能点明细表.json
    // 2. 分析核心交易的触发源与终态
    return {
      test_targets: [
        { interface: "BGL账户联机记账", methods: ["POST"], type: "EI" }
      ],
      state_flows: ["待记账 -> 锁存中 -> 记账成功", "锁存中 -> 超时 -> 自动冲正"]
    };
  },
});

```

### 工具二：金融级用例矩阵生成器 (`generate_excel_test_cases`)

* **作用**：自动编写 Excel 字节流（通过 Node.js 的 `xlsx` 或 `exceljs` 库），直接在工作空间写出完全符合银行合规内审的测试案例。

```ts
export const generateExcelTestCases = tool({
  description: '根据分析出的测试矩阵，生成符合银行内审标准的 `.xlsx` 测试用例文件，并持久化到工作空间。',
  parameters: z.object({
    workspacePath: z.string(),
    cases: z.array(z.object({
      caseId: z.string().describe('用例编号，如 TC-BGL-001'),
      moduleName: z.string().describe('模块名称'),
      title: z.string().describe('用例名称'),
      preCondition: z.string().describe('前置条件'),
      steps: z.string().describe('测试步骤（多步用\\n换行）'),
      expectedResult: z.string().describe('预期结果'),
      caseType: z.enum(['正向流程', '逆向流程', '异常边界', '高并发性能'])
    }))
  }),
  execute: async ({ workspacePath, cases }) => {
    // 1. 加载企业标准的 Excel 模板
    // 2. 遍历 cases 写入行数据，设置加粗、单元格边框等样式
    // 3. 写入到 workspace/outputs/test-analysis/02_自动化标准测试用例.xlsx
    return { success: true, total_cases_generated: cases.length };
  },
});

```

### 工具三：测试造数规约导出器 (`export_data_generation_rules`)

* **作用**：自动生成一个包含字段类型、边界值、动态签名算法的数据规约文件，为下游自动造数铺路。

```ts
export const exportDataGenerationRules = tool({
  description: '将测试所需的批量造数或接口参数 Mock 规则，以结构化 JSON 的形式导出，供造数工具直读。',
  parameters: z.object({
    workspacePath: z.string(),
    fieldRules: z.array(z.object({
      fieldName: z.string().describe('字段名，如 acc_no'),
      dataType: z.string().describe('定长/String/Number'),
      length: z.number().optional(),
      mockStrategy: z.string().describe('脱敏生成策略：如"19位银行卡号随机且前6位固定"'),
      isPrimaryKey: z.boolean()
    }))
  }),
  execute: async ({ workspacePath, fieldRules }) => {
    // 固化成 json 文件，供后续“批量造数场景包”做高性能批量 I/O 时直接读取
    return { success: true, path: `${workspacePath}/outputs/test-analysis/03_批量造数规则集.json` };
  },
});

```

---

## 4. 全自治测试分析的工作流 (Execution Loop)

通过 Vercel AI SDK 的 `maxSteps` 和多步工具协同，Agent 在工作空间内的思考和动作轨迹如下：

```
【测试分析专家 (bank-test-analyser) 被唤醒】
   │
   ├── Step 1: 扫描工作空间，读取《02_功能点明细表.json》，得知本次改造重点是“散列BGL账户表(ILF)”与“联机记账(EI)”。
   │
   ├── Step 2: 调用 `extract_test_matrix` 工具，提炼出记账状态机，识别出有“自动冲正”这一核心逆向逻辑。
   │
   ├── Step 3: 依据 System Prompt 红线，在大模型内部自主设计：
   │             - 正向用例：正常记账、多账户并发记账。
   │             - 逆向用例：超时触发冲正流水、冲正失败后的挂账。
   │             - 异常边界：金额为0、账户冻结状态记账（幂等校验）。
   │
   ├── Step 4: 调用 `generate_excel_test_cases` 工具，将多维度用例固化为 `02_自动化标准测试用例.xlsx`。
   │
   └── Step 5: 调用 `export_data_generation_rules` 工具，导出账户、流水号的脱敏造数规则 JSON。

```

---

## 5. 跨场景完美联动案例

这套架构的高明之处在于**下游场景包的无缝衔接**：

当本场景的 Agent 输出了 `03_批量造数规则集.json` 之后，用户如果点击切换到下一个场景 **【批量文件造数专家 (batch-data-generator)】**，该造数 Agent 根本不需要重新理解几百页的需求文档，它只需要调用本地 Python 沙箱工具，**读取这个规约 JSON，即可通过多线程 Python 脚本在 Workspace 中瞬间飙出百万条符合格式的定长对账文件**。

这个测试分析专家的闭环规划和跨场景链路符合您的设计初衷吗？我们可以针对这个测试案例生成的 Zod Schema（如何确保 Agent 生成的步骤足够精确）做进一步精化，或者直接推演下一个场景？
