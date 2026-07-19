
这个确实是一个“史诗级”的深水区场景。在银行数字化转型中，核心大账系统从旧时代的 COBOL 走向现代的 Java（特别是现代栈如 Java 21 / Spring Boot 3，或者求稳的 Java 8 栈），是几乎所有顶级银行都在打的硬仗。

这种改造不是简单的“语法翻译”，因为 COBOL 的核心痛点在于：

1. **面向记录的数据流（Record-Oriented）**：充斥着 `01 COMP-3` 这种密集的高精度压缩十进制字节计算，Java 如果用 `double` 会直接产生资损，必须死磕 `BigDecimal`。
2. **全局数据区污染（Linkage Section / Working-Storage）**：COBOL 程序没有现代面向对象的局部作用域概念，上千行的全局变量随意读写，极易发生“隐式数据污染”。
3. **老核心的批量对账与联机事务交织**：极度依赖 EBCDIC 编码的**定长文件批量日终处理**，与高吞吐的**联机交易**紧密绑定。

为了真正能干掉这只巨兽，拒绝空中楼阁，我们将这个场景命名为：**【COBOL 核心向 Java 现代架构重构专家 (bank-cobol-to-java-expert)】**。

下面为您做深度架构推演：

---

## 一、 物理工作空间资产链路 (Workspace Input/Output)

在这个场景中，物理隔离的工作空间将充当一个“全自动代码编译与重构沙箱”。

```
[工作空间输入区]
 ├── workspace/inputs/cobol-src/
 │    ├── ACCOUNT_TRANSFER.cbl (原始 COBOL 核心交易程序)
 │    └── CUST_RECORD.cpy       (COBOL Copybook 类似于 Java 的 DTO 结构体定义)
 ├── workspace/inputs/specs/
 │    └── system_context.json   (定义本次重构的目标 Java 版本、分层规范与包结构)
 │
 └── 【COBOL 现代重构专家 (bank-cobol-to-java-expert) 启动】
        │
        ▼ [分析数据项占位 -> 规避作用域污染 -> 生成现代 Java 分层架构 -> 静态防资损审查]
        │
[工作空间输出区]
 └── workspace/outputs/java-src/
      ├── src/main/java/com/bank/core/domain/dto/CustRecord.java     (根据 Copybook 翻译的强类型对象)
      ├── src/main/java/com/bank/core/service/AccountTransferService.java (重构后的核心业务逻辑)
      └── 01_重构审计与等价性分析报告.md (详细记录数据类型转换、潜在溢出风险及性能改写建议)
```

---

## 二、 核心专属工具箱 (Skills Schema)

为了防止模型“胡乱翻译”导致生产资损，我们不能让 Agent 一次性把几千行 COBOL 盲编成 Java。我们需要为其定制 3 个具备强底层编译原理支撑的专用工具：

### 工具一：Copybook 数据结构语义解析器 (`parse_cobol_copybook`)

* **作用**：解析 COBOL 独特的 `PIC`（Picture）类型，精准映射到 Java 的高精度类型，防止精度丢失。

```ts
import { tool } from 'ai';
import { z } from 'zod';

export const parseCobolCopybook = tool({
  description: '扫描工作空间中的 COBOL Copybook (.cpy) 文件，精准解析 PIC 占位符定义，映射为 Java 类型契约。',
  parameters: z.object({
    workspacePath: z.string(),
    copybookFileName: z.string(),
  }),
  execute: async ({ workspacePath, copybookFileName }) => {
    // 读取 Copybook 源码并进行词法分析
    // 例如：05 BALANCE PIC S9(13)V99 COMP-3. 
    // 代表带符号、13位整数、2位小数的压缩十进制数。
    return {
      mappings: [
        { cobolField: "BALANCE", javaType: "BigDecimal", scale: 2, precision: 15, isPacked: true }
      ]
    };
  },
});
```

### 工具二：全局变量作用域解耦与数据流跟踪器 (`analyze_cobol_data_flow`)

* **作用**：分析 COBOL `WORKING-STORAGE SECTION` 中成百上千的全局变量，找出哪些是交易入参、哪些是中间控制变量、哪些是出参，防止 Java 化之后的方法变成“万能超长事务”。

```ts
export const analyzeCobolDataFlow = tool({
  description: '分析 COBOL 程序的 Procedure Division，跟踪全局变量的读写生命周期，将其解耦为 Java 的局部变量与方法入参。',
  parameters: z.object({
    workspacePath: z.string(),
    sourceFileName: z.string(),
  }),
  execute: async ({ workspacePath, sourceFileName }) => {
    // 分析源码中 MOVE, ADD, PERFORM UNTIL 等控制流
    return {
      input_fields: ["WS-TRANS-AMT", "WS-FROM-ACC"],
      output_fields: ["WS-RESP-CODE", "WS-NEW-BALANCE"],
      internal_loop_flags: ["WS-EOF-SWITCH"] // 这些将被转化为 Java 的 local boolean loop var
    };
  },
});
```

### 工具三：Java 代码分层合规固化器 (`save_refactored_java_code`)

* **作用**：将大模型生成的 Java 代码，按照银行现代分层规范（Controller / Service / Repository / DTO）安全地写出到工作空间，并自动用 Checkstyle 检查规范。

```ts
export const saveRefactoredJavaCode = tool({
  description: '将重构后的 Java 代码按照标准 Maven/Gradle 工程目录结构写入工作空间，并返回固化状态。',
  parameters: z.object({
    workspacePath: z.string(),
    targetPackage: z.string().describe('基本包路径，如 com.bank.core'),
    javaFiles: z.array(z.object({
      className: z.string(),
      subFolder: z.enum(['domain/dto', 'service', 'repository']),
      codeContent: z.string().describe('完整的 Java 源代码')
    }))
  }),
  execute: async ({ workspacePath, targetPackage, javaFiles }) => {
    // 自动在 outputs/java-src/ 下建立对应的包目录结构并写入文件
    return { success: true, files_written: javaFiles.map(f => f.className) };
  },
});
```

---

## 三、 Agent 转换推演工作流 (The Core CoT Loop)

当接收到核心转换任务时，Agent 的多步链式推理轨迹如下：

1. **数据类型重映射:** 精准度量数据契约.
   Agent 首先读取 Copybook，调用 `parse_cobol_copybook`。得知 `PIC S9(13)V99` 绝不能翻译成 `double` 或 `float`，必须在生成的 Java DTO 中强制声明为 `BigDecimal`，并在 getter/setter 中做精度的初始化截断保护。
2. **解耦全局副作用:** 梳理揉碎的控制流.
   调用 `analyze_cobol_data_flow`。分析发现 COBOL 原有代码利用了大量的 `GO TO` 或嵌套 `PERFORM` 来修改全局变量。Agent 在内存中将其重新构造成现代 Java 的 **Structured Concurrency（结构化并发）** 或清晰的 `if-else` 分支控制，将全局变量全部收敛为局部变量或方法返回值。
3. **面向对象与分层重构:** 对齐现代技术栈.
   依据 `system_context.json` 要求的技术栈（例如 Java 21 虚拟线程支持），Agent 开始编写现代化的 Service 类。把原有的 COBOL DB2 嵌入式 SQL（`EXEC SQL`）语句，优雅地改写为符合 Spring Boot 3 规范的强类型 Repository 数据访问层，并采用**参数化绑定变量**以防 SQL 注入。
4. **输出代码与风险对齐:** 固化与发布审计报告.
   调用 `save_refactored_java_code` 将代码落盘，并在工作空间输出重构审计报告，详细罗列 COBOL 的 `COMP-3` 字节码在 Java 中是如何被高性能解析的，确保每一行核心逻辑皆可被复核。

---

## 四、 成果展现：重构审计报告与 Java 代码对比片段

以下是 Agent 最终在工作空间自动生成的比对审计结果（片段）：

### 📄 01_重构审计与等价性分析报告.md

```markdown
# COBOL 核心交易重构审计报告
**原始文件：** `inputs/cobol-src/ACCOUNT_TRANSFER.cbl`
**目标架构：** Java 21 / Spring Boot 3.x / MyBatis-Flex (稳健持久层)

---

## 一、 核心逻辑等价转换对齐

### 1. 数据高精度防资损转换
*   **COBOL 原文：** `05  WS-BAL  PIC S9(11)V99 COMP-3.`
*   **Java 映射：** `private BigDecimal wsBal;`
*   **审计判定：** 严禁使用浮点数。使用 `BigDecimal` 并显式指定 `MathContext.DECIMAL64`（保留2位小数，舍入模式：HALF_UP），完美对齐 COBOL 的 `COMP-3` 压缩十进制截断规则。

### 2. 长事务与锁控制优化
*   **COBOL 缺陷**：原有 `PERFORM 300-DB-UPDATE` 阶段在循环中更新账户表，且中间穿插了外围系统的 MQ 报文发送，导致高并发散列账户极易产生行级锁超时。
*   **Java 重构优化**：在 `AccountTransferService` 中引入声明式事务 `@Transactional(timeout = 5)`，将 MQ 异步发送抽离出事务核心边界，缩短持锁时间，从源头切断高并发死锁隐患。

---

## 二、 核心重构 Java 代码片段 (Service 层)

```java
package com.bank.core.service;

import com.bank.core.domain.dto.CustRecord;
import java.math.BigDecimal;
import java.math.RoundingMode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 核心转账交易服务 - 由【COBOL重构专家】全自动生成
 * 原始程序: ACCOUNT_TRANSFER.cbl
 */
@Service
public class AccountTransferService {

    private final AccountRepository accountRepository;

    public AccountTransferService(AccountRepository accountRepository) {
        this.accountRepository = accountRepository;
    }

    @Transactional(timeout = 5)
    public boolean executeTransfer(String fromAcc, String toAcc, BigDecimal transferAmt) {
        // 1. 严格防资损边界校验
        if (transferAmt == null || transferAmt.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("交易金额必须大于0");
        }

        // 2. 悲观锁/乐观锁控制 (基于企业分布式架构规范)
        CustRecord fromRecord = accountRepository.selectForUpdate(fromAcc);
        if (fromRecord.getBalance().compareTo(transferAmt) < 0) {
            return false; // 余额不足 (对应旧核心 RESP-CODE = 91)
        }

        // 3. 高精度扣减与更新
        BigDecimal newFromBal = fromRecord.getBalance().subtract(transferAmt).setScale(2, RoundingMode.HALF_UP);
        accountRepository.updateBalance(fromAcc, newFromBal);

        return true;
    }
}
```

---

## 🎯 跨场景的终极闭环（平台全局联动）

当这个 **【COBOL 重构专家】** 在物理工作空间输出完整的 Java 代码后，整个平台可以瞬间形成多场景的**海陆空三军联动**：

1. **需求分析专家 (`bank-req-refiner`)** 顺势反向提取这段 Java 代码的业务逻辑，生成最新的系统功能清单。
2. **测试分析专家 (`bank-test-analyser`)** 拿着新生成的 Java 接口定义，立刻生成包含各种逆向冲正的业务功能测试用例。
3. **UI 自动化专家 (`bank-ui-validator`)** 拿着配置，开始去网银页面上验证这个新转账接口在前端界面的呈现是否完美对齐。

这个史诗级重构场景的底层推演与工程落地逻辑，是否符合您对全面接管银行核心系统开发的宏大设想？您希望我们接下来将哪个环节做进一步的深度战术细化？





要让 **【COBOL 核心向 Java 现代架构重构专家 (bank-cobol-to-java-expert)】** 在物理工作空间中实现“输入 COBOL 源码 $\rightarrow$ 静态深度分析 $\rightarrow$ 产出高精度 Java 实现 $\rightarrow$ 自动输出全套配套文档（含重构不足与改进建议）”**的完整闭环，我们需要设计一个标准的**多阶段渐进式重构流水线。

因为 COBOL 包含大量隐式逻辑，Agent 不能“一笔画”直接写 Java，必须分步拆解。以下是该场景在物理工作空间（Workspace）内的**完整资产链路、执行步骤与全套文档产出规范**：

---

## 一、 工作空间资产目录结构 (Workspace Filesystem)

整个重构过程完全基于服务器端的真实物理目录进行输入与输出的隔离：

```
[工作空间输入区]
 ├── workspace/inputs/cobol-src/
 │    ├── LN_INTEREST_CALC.cbl   (COBOL 贷款计息与核心记账示例源码)
 │    └── DEPOSIT_REC.cpy        (配套的 Copybook 数据结构定义文件)
 │
 └── 【COBOL 现代重构专家启动】
        │
        ▼ [词法与控制流分析 -> 数据依赖打散 -> 现代 Java 分层转化 -> 风险与不足审计]
        │
[工作空间输出区]
 └── workspace/outputs/refactored-java/
      ├── src/main/java/com/bank/core/      (完整对齐银行现代栈的 Java 源码结构)
      └── docs/ (配套的全套审计与技术文档)
           ├── 01_COBOL源码深度解析与数据字典.md
           ├── 02_Java架构设计与映射对齐说明书.md
           └── 03_重构局限性、不足与后续优化建议.md  <── (核心：暴露大模型重构的边界与系统架构风险)

```

---

## 二、 核心专属工具箱 (Skills Schema)

为了支撑这一深度分析和多文档输出的过程，我们需要为 Agent 动态注入 3 个专属工具：

```ts
// 1. 深度源码静态分析工具：识别隐式数据污染和段落跳转
export const analyzeCobolParagraphs = tool({
  description: '静态分析 COBOL 的 Procedure Division，理清 PERFORM, GO TO 以及数据段落(Paragraph)之间的调用拓扑图。',
  parameters: z.object({ workspacePath: z.string(), sourceFile: z.string() }),
  execute: async ({ workspacePath, sourceFile }) => {
    return {
      paragraphs: ["100-INIT", "200-CALC-INTEREST", "300-WRITE-JOURNAL"],
      implicit_modifications: [{ field: "WS-TOTAL-INTEREST", modified_by: ["200-CALC-INTEREST"] }]
    };
  }
});

// 2. 差错与不足审计工具：专门用于记录模型在重构过程中发现的局限性
export const logRefactoringGaps = tool({
  description: '在内存中积累转换差异、精度风险、长事务隐患，用于最后生成《重构不足与优化建议》文档。',
  parameters: z.object({
    workspacePath: z.string(),
    gaps: z.array(z.object({
      category: z.enum(['数据类型精度', '并发与锁机制', '性能损耗', '未翻译隐式逻辑']),
      cobolLocation: z.string().describe('COBOL 源码行号或段落名'),
      riskDescription: z.string(),
      mitigationStrategy: z.string().describe('建议人工干预或后续重构的策略')
    }))
  }),
  execute: async ({ workspacePath, gaps }) => { return { status: 'STORED', count: gaps.length }; }
});

```

---

## 三、 Agent 重构与文档生成工作流 (Execution Sequence)

1. **阶段一：逆向解析与资产梳理:** 2 min.
   Agent 调用 `parse_cobol_copybook` 和 `analyze_cobol_paragraphs` 工具，将 COBOL 中的高精度压缩十进制数据项（如 `COMP-3`）和杂乱的跳转段落解耦，在内存中还原为结构化的**“数据字典”**与**“业务状态机”**。
2. **阶段二：等价 Java 代码生成:** 5 min.
   基于解析出的状态机，Agent 自动按照现代 Java 21 / Spring Boot 3 规范编写面向对象的实现，将 DTO、Service、Repository 分层落盘。所有金额更新全部强制强制绑定变量并使用 `BigDecimal`。
3. **阶段三：全套配套文档产出:** 3 min.
   Agent 开始在 `outputs/docs/` 目录下依次固化三份核心文档，不仅记录“怎么转换的”，更以极度严苛的审计视角揪出**“大模型翻译的不足之处”**。

---

## 四、 核心产出物：全套配套文档标准规范示例

以下是 Agent 在物理工作空间中自动生成的全套配套文档结构：

### 文档一：`01_COBOL源码深度解析与数据字典.md`

> **目的**：还原老核心的底层逻辑，为后续测试和内审提供逆向依据。

```markdown
# 01_COBOL源码深度解析与数据字典

## 一、 原始程序元数据
*   **源码名称**：`LN_INTEREST_CALC.cbl`（贷款计息与核心记账程序）
*   **技术体系**：IBM COBOL / DB2 嵌入式 SQL
*   **业务核心逻辑**：读取积数表，按照浮动利率计算利息，更新客户大账，并在日终生成定长清算流水。

## 二、 核心数据资产映射表 (Data Dictionary)
| COBOL 原始数据项 | 存储类型 | 物理含义 | Java 转化契约 | 转换判定依据 |
| :--- | :--- | :--- | :--- | :--- |
| `01 LN-AMT PIC S9(13)V99 COMP-3.` | 压缩十进制(8字节) | 贷款本金 | `BigDecimal` | 金融高精度防资损红线，严禁浮点数。 |
| `01 LN-STATUS PIC X(02).` | 定长字符串 | 贷款状态 | `String` (或 Enum) | 映射为强类型 Java 枚举类 `LoanStatusEnum`。 |

```

---

### 文档二：`02_Java架构设计与映射对齐说明书.md`

> **目的**：阐述新 Java 系统的分层与技术选型，向架构委员会汇报。

```markdown
# 02_Java架构设计与映射对齐说明书

## 一、 现代分层目标架构
重构后的系统完全遵循微服务云原生架构设计，采用 **Java 21 (虚拟线程) + Spring Boot 3.x + Persistent 层 (MyBatis-Flex)**。

## 二、 逻辑映射对齐对照
1.  **控制流转换**：将原有 COBOL 中通过 `PERFORM 200-LOOP UNTIL WS-EOF` 的过程式文件循环，重构为 Java 21 的 `Stream API` 与响应式批处理逻辑，大幅提升多核 CPU 利用率。
2.  **持久层重构**：原有的嵌入式 `EXEC SQL UPDATE T_LOAN_MASTER ...` 语句，完全封装进 `LoanMasterRepository` 中，并强制采用**参数化占位符**防范 SQL 注入风险。

```

---

### 文档三（最核心）：`03_重构局限性、不足与后续优化建议.md`

> **目的**：**直面大模型转换的边界**。暴露由于 COBOL 过程式语言与 Java 面向对象天然鸿沟导致的“强行缝合”代码，为人工二次精化指明方向。

```markdown
# 03_重构局限性、不足与后续优化建议

经【COBOL现代重构专家】严苛静态审查，虽然当前生成的 Java 代码已通过编译且逻辑等价，但由于 COBOL 与 Java 的范式差异，新系统存在以下 **重构局限性与潜在隐患**，建议架构师团队在进入 UAT 测试前进行人工干预：

## 一、 技术重构缺陷与不足 (Gaps & Shortcomings)

### 1. 内存副作用残留（全局变量污染后遗症）
*   **位置**：`AccountTransferService.java` 第 145 行。
*   **不足描述**：原始 COBOL 代码在 `LINKAGE SECTION` 中大量复用了 `WS-TEMP-BUFFER` 这一全局缓冲区来动态存放临时账号和利息数据。Agent 在重构为 Java 时，虽然将其局部变量化，但由于多个嵌套私有方法之间存在隐式调用依赖，导致 Service 类中衍生出了一个包含 18 个字段的超大上下文参数对象（`TransactionContext`）。
*   **不良后果**：代码可读性较差，未完全实现面向对象的高度内聚，带有明显的“过程式编程”痕迹。

### 2. 数据库长事务与行级锁冲突隐患
*   **位置**：`InterestCalcRepository.java` 批量更新段落。
*   **不足描述**：旧核心 COBOL 程序在进行日终大批量计息时，依赖的是大型机主频的高独占性，直接在单线程循环里对 `T_LOAN_MASTER` 表锁行更新。大模型直接翻译成 Java 的 `@Transactional` 循环后，在高并发分布式环境下会导致**严重的数据库行级锁超时与死锁**。
*   **转化局限**：Agent 无法在没有全局拓扑的情况下自主将其重构为“分布式异步队列记账”。

---

## 二、 后续人工二次精化建议 (Mitigation Action Plan)

### 🚨 紧急改进项（进入压测前必须修改）
1.  **拆分长事务**：建议人工重构 `executeBatchCalc` 方法，引入 **Spring Batch 分片（Chunk）机制**，每 500 笔贷款提交一次事务，并在中间引入 Redis 分布式锁进行**热点账户散列化改造**。
2.  **消除超大上下文对象**：对 `TransactionContext` 进行领域驱动设计（DDD）拆解，将其打散为 `InterestEntity` 和 `JournalEntity` 两个独立的领域对象，消除隐式全局依赖。

```

---

## 💡 下一步推演

通过这套方案，您的平台不仅能实现代码的重构，还能输出一份**极其诚实、具备高价值审计性的《不足与优化报告》**。这份报告对于银行架构委员会来说，比代码本身还重要，因为它清晰地划定了“AI 自动化的终点”与“顶级架构师人工调优的起点”。

目前这个重构专家全套文档的输出规划已经完全跑通，**您希望我们接下来直接切入到哪一步的具体推演？**



**这套方案不仅能落地，而且在银行核心重构的实际工程中，这是唯一能够控制资损风险、真正让项目推进下去的“硬核”落地法。**

之所以说它不是空中楼阁，是因为它完全避开了传统大模型“一键把代码从头翻译到尾”的盲盒模式，而是采用了“平台工具链（编译级强约束）+ 智能体（上下文编排）”的半自动化工程管线。

为了证明它的可落地性，我们可以把整套流水线拆解为具体的**工程落地三部曲**，看看在实际的开发流水线（CI/CD）中它究竟是如何跑起来的：

---

## 🛠️ 第一步：底座工具落地（编译原理硬对抗，不靠模型瞎猜）

要落地，第一关是解决“COBOL 语法解析”。如果直接把几万行 COBOL 源码塞给大模型，模型必然会发生幻觉（比如把 `COMP-3` 字节算错，导致几分钱的对账误差，在银行这就是重大生产事故）。

### 真实落地做法：

底座不依赖模型去读源码，而是使用成熟的静态编译分析工具（如 ANTLR4 编写的 COBOL 语法解析器）或者商业化的逆向工具。

* 工具直接将 COBOL 的 `Procedure Division` 转化为 **AST（抽象语法树）** 和 **控制流图（CFG）**。
* 智能体（Agent）拿到的不是原始文本，而是经过底座清洗后的结构化 JSON 数据（例如：`{段落: 100-INIT, 读取变量: [A, B], 写入变量: [C]}`）。**工具负责绝对准确的结构提取，模型只负责现代 Java 语言的优雅实现与分层编排。**

---

## 📈 第二步：动态测试沙箱落地（等价性双核比对）

重构中最怕的是“看着像，跑起来全是错”。文档写得再漂亮，代码跑不对依然是空中楼阁。因此，落地必须包含**物理隔离的测试沙箱与双核动态比对机制**。

1. **提取老核心测试桩数据:** 平台底座执行.
   底座从大型机或 UAT 环境中抓取一笔真实的 COBOL 交易输入与输出报文（包含 EBCDIC 压缩十进制的定长字节流，以及 DB2 数据库变更前后的快照）。
2. **全自动单元测试生成:** 沙箱环境编译.
   Agent 根据这笔动态数据，自动在 Java 工作空间中生成对应的 JUnit 测试用例，将旧报文转化为 `BigDecimal` 灌入刚刚重构生成的 `AccountTransferService`。
3. **字节级结果对齐:** 双核断言比对.
   在沙箱中运行 Java 代码。底座工具链自动拦截 Java 执行后的数据库变更与返回对象，与 COBOL 的真实输出进行**逐个字节的断言比对（Assert）**。只要金额相差 $0.01$ 元，或者少了一笔流水日志，立刻宣告重构失败，并将报错 Trace 反哺给 Agent 进行二次修正。

---

## 👨‍💻 第三步：人工介入（Human-in-the-Loop）的工程闭环

AI 自动重构的定位从来不是“完全取代架构师”，而是“帮架构师完成 70% 的脏活累活，并把剩下的 30% 风险清清楚楚地指出来”。

这就是为什么第三份文档（《重构局限性、不足与后续优化建议》）是落地的核心：

| 阶段             | AI 自动干的脏活（70%）                                | 顶级架构师干的细活（30%）                                                                 |
| ---------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **数据层** | 将几千个`PIC S9(13)V99` 机械地转为 `BigDecimal`。 | 审核热点账户的并发隔离级，决定是否引入分布式锁。                                          |
| **结构层** | 把扁平的过程式代码强行封装进微服务 Service 中。       | 根据《不足报告》中的提示，重构过大的全局上下文对象，进行**DDD 领域驱动建模**。      |
| **性能层** | 按原有逻辑一行行改写为 Java 并发控制。                | 接入现有的中间件（如 Spring Batch, RocketMQ），将旧的大型机文件批处理改造为分布式流处理。 |

---

## 🎯 总结

这套方案能落地，是因为它承认了 AI 的局限性：

1. 它用**编译级工具**死死卡住了金融资损的“数据红线”；
2. 它用**自动化沙箱双核测试**堵死了“逻辑不等价”的风险；
3. 它用**诚实的风险不足报告**明确划定了人机协作的边界。

这就是工业级的重构流水线，它不是聊天软件里的空中楼阁，而是一个**挂载了强力工具链的智能代码演进工厂**。

既然这个重构闭环的落地逻辑已经夯实，**您希望我们接下来针对“双核动态比对沙箱”的细节进行设计，还是推进下一个核心场景的推演？**



在银行核心系统从 COBOL 走向 Java 的史诗级重构中，**“双核动态比对沙箱”（Dual-Core Dynamic Validation Sandbox）** 是阻断金融资损的“马奇诺防线”。大型机上的 COBOL 代码运行了数十年，各种隐式溢出、奇特截断和特定的非标边界处理（如日终切日时的临界状态），单靠人工看代码或写静态用例是绝对无法完全覆盖的。

为了让这个沙箱真正落地，我们将设计一套“流量双发、状态双录、字节断言”的物理隔离沙箱系统。

---

## 一、 沙箱架构与物理资产拓扑

双核动态比对沙箱的核心逻辑是：**给新旧两个“核心引擎”喂完全相同的输入，拦截并对比它们产生的每一处微小输出与副作用（数据库变更、文件写入、内存状态）**。

```
                       ┌─────────────────────────┐
                       │  生产流量回放 / 自动化用例 │
                       └────────────┬────────────┘
                                    │
                                    ▼ (完全相同的交易入参 JSON/XML)
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
        ┌───────────────────┐               ┌───────────────────┐
        │  COBOL 模拟核心    │               │  新重构 Java 核心  │
        │ (GnuCOBOL/大型机测试桩)│            │ (Spring Boot 3.x) │
        └─────────┬─────────┘               └─────────┬─────────┘
                  │                                   │
                  ├─────────────────┬─────────────────┤
                  ▼                 ▼                 ▼
          【数据库变更快照】    【交易返回报文】    【日终定长文件】
          (DB2 Snapshot)    (Response Body)   (EBCDIC Stream)
                  │                 │                 │
                  └─────────────────┼─────────────────┘
                                    ▼
                        ┌───────────────────────┐
                        │   双核动态比对引擎     │
                        │ (Diff & Assert Agent) │
                        └───────────┬───────────┘
                                    │
                                    ▼
                        ┌───────────────────────┐
                        │  outputs/sandbox/     │
                        │  比对报告与资损阻断日志 │
                        └───────────────────────┘

```

---

## 二、 核心专属比对工具箱 (Sandbox Skills Schema)

为了支撑字节级的精准对齐，底座向 Agent 注入两个具备底层数据拦截能力的专属比对工具：

### 1. 数据库状态机影子拦截器 (`intercept_db_snapshot`)

* **作用**：在交易执行前后，对沙箱内的数据库（COBOL 的 DB2 影子库与 Java 的 MySQL/PostgreSQL 影子库）进行行级增量快照提取，比对每一列的变更。

```ts
import { tool } from 'ai';
import { z } from 'zod';

export const interceptDbSnapshot = tool({
  description: '捕获双核沙箱中 COBOL 与 Java 执行同一交易前后的数据库行级快照，用于字段级比对。',
  parameters: z.object({
    transactionId: z.string().describe('当前比对的交易流水号'),
    targetTables: z.array(z.string()).describe('关联的核心资产表，如 T_LOAN_MASTER, T_ACCOUNT')
  }),
  execute: async ({ transactionId, targetTables }) => {
    // 底层逻辑：从沙箱数据库的 Binlog 或 Flashback 中提取该事务引发的 Row-Movement
    return {
      cobol_changes: [
        { table: "T_ACCOUNT", key: "622502XXXX", before: { BAL: 100.00 }, after: { BAL: 80.50 } }
      ],
      java_changes: [
        { table: "T_ACCOUNT", key: "622502XXXX", before: { bal: 100.00 }, after: { bal: 80.50 } }
      ]
    };
  }
});

```

### 2. EBCDIC-UTF8 定长文件流核对器 (`diff_binary_stream`)

* **作用**：银行日终的核心产出往往是清算文件。COBOL 采用 EBCDIC 编码且包含 `COMP-3` 字节压缩，Java 采用 UTF-8 或标准的明文定长。此工具用于跨编码的二进制等价性核对。

```ts
export const diffBinaryStream = tool({
  description: '跨编码对比 COBOL 生成的日终二进制文件与 Java 生成的清算文件是否内容等价。',
  parameters: z.object({
    cobolFilePath: z.string().describe('COBOL 侧生成的 EBCDIC 字节流路径'),
    javaFilePath: z.string().describe('Java 侧生成的文本流路径'),
    copybookMappingPath: z.string().describe('用于定义定长字节含义的 Copybook 路径')
  }),
  execute: async ({ cobolFilePath, javaFilePath, copybookMappingPath }) => {
    // 解析二进制字节，将其反序列化后与 Java 的文件内容逐行逐字段对齐
    return {
      isIdentical: false,
      mismatches: [
        { line: 402, field: "INTEREST_AMT", cobolValue: "00000001245.56", javaValue: "00000001245.55", gap: "0.01" }
      ]
    };
  }
});

```

---

## 三   沙箱闭环执行工作流 (CoT Loop)

当自动化测试流触发时，Agent 在沙箱内部执行如下闭环审计步骤：

1. **步骤一：环境隔离与流量双发:** 输入对齐.
   Agent 将一笔生产脱敏的“贷款结清交易”流量同时灌入 COBOL 容器和 Java 容器。此时，底座工具链会克隆两个完全一致的初始数据库环境。
2. **步骤二：副作用数据捕获:** 状态拦截.
   两边核心引擎执行完毕。Agent 触发 `intercept_db_snapshot` 抓取两边的数据库变更，并读取各自产生的 Response 报文与本地日志文件。
3. **步骤三：三维等价性对齐:** 精准断言.
   Agent 对比三项指标：
4. **交易响应**（状态码与错误提示是否完全一致）；
5. **数据库变更**（Java 更新的字段值与 COBOL 是否在分分厘厘上完全对齐）；
6. **批处理文件**（调用 `diff_binary_stream` 确保清算文件无损）。
7. **步骤四：缺陷诊断与报告固化:** 反哺迭代.
   若发现不一致（如经典的小数点第 3 位舍入误差），Agent 绝不流于表面，而是顺着堆栈定位到具体的 Java 类与行号，将差错归类写入报告，并给出修复方案。

---

## 四、 核心产出物：双核比对差错审计报告示例

以下是沙箱在发现一笔交易不等价时，自动在 `workspace/outputs/sandbox/` 下固化的真实工业级报告：

### 📄 `04_双核动态比对差错与资损阻断报告.md`

```markdown
# 双核动态比对差错与资损阻断报告
**评估时间**：2026-07-19 22:52:45
**比对流水号**：TX-20260719-LOAN-88901
**交易类型**：LN_INT_ACCRUAL (贷款利息计提事务)

---

## 一、 比对判定结论：❌ 失败 (资损风险阻断触发)

> **触发红线描述**：新重构的 Java 核心系统在计算利息天数处于闰年临界点时，与 COBOL 老核心产生了 **￥0.01 元** 的计算偏差。高并发批量运行下会导致总账对账不平，已自动实施代码固化阻断。

---

## 二、 三维动态差异详情

### 1. 交易返回报文比对 (Response Diff)
*   **COBOL 核心返回**：`{"rtnCode": "00", "interestAccrued": 1245.56}`
*   **Java 核心返回**：`{"rtnCode": "00", "interestAccrued": 1245.55}`
*   **差异项**：`interestAccrued` 字段产生 `-0.01` 误差。

### 2. 数据库变更追踪 (DB Snapshot Diff)
调用 `intercept_db_snapshot` 捕获的账户主表更新数据如下：
```json
{
  "table": "T_LOAN_MASTER",
  "primary_key": "LN_ACC_2026_99812",
  "columns": {
    "COBOL_AFTER": { "CURR_ACC_INT": 45892.12 },
    "JAVA_AFTER":  { "currAccInt": 45892.11 },
    "GAP": "-0.01"
  }
}

```

### 3. 底层二进制清算流核对 (File Binary Diff)

调用 `diff_binary_stream` 扫描日终对账文件 `EOD_GL_20260719.dat`：

* **COBOL 侧 (EBCDIC 压缩码)**：第 89 行 `00000004589212`
* **Java 侧 (UTF-8 明文流)**：第 89 行 `00000004589211`

---

## 三、 根因静态诊断与修复建议

### 1. 差错根因定位

* **COBOL 隐式机制**：老核心 COBOL 程序在 `200-CALC-DAYS` 段落中，利用了一个 `PIC 9(03) COMP` 的截断计算来获取当前利息天数比例。当分母为 `366` 天时，COBOL 执行 `DIVIDE` 会产生**向正无穷方向的隐式截断保留**。
* **Java 重构缺陷**：Agent 自动生成的 `LoanInterestCalculator.java` 第 78 行采用了标准的 `RoundingMode.HALF_UP`（四舍五入），在处理特定边界值时，正好导致了最后一位分的“少进位”。

### 2. Java 代码一键修复补丁 (建议替换)

建议将 `src/main/java/com/bank/core/calculator/LoanInterestCalculator.java` 的第 78 行改写为符合旧核心大型机特性的截断模式：

```java
// 原始生成 (❌ 产生四舍五入误差)
// BigDecimal dailyRate = interestRate.divide(new BigDecimal("366"), RoundingMode.HALF_UP);

// 建议修复 (✓ 完美对齐 COBOL 的 COMP 截断特性)
BigDecimal dailyRate = interestRate.divide(new BigDecimal("366"), 18, RoundingMode.DOWN);

```

---

## 💡 落地可行性总结

这套“双核动态比对沙箱”的设计之所以能落地，是因为它**把金融对账的思维直接搬进了代码测试阶段**。

它不再和开发争论“到底谁的算法更符合现代数学”，而是以“老核心的行为就是唯一真理”为最高信条。只要 Java 跑出的结果和老核心大型机有半个字节的不一致，沙箱就会精准报警并指明修复方向。这才是银行敢把老 COBOL 系统交由 AI 重构的底气所在。

现在，沙箱的底层运行和差错阻断机制已经非常清晰。**针对这个双核沙箱，您是希望我们继续细化它的“大批量流量回放性能指标”，还是让我们推进到整个银行微服务流水线中的下一个核心关卡？**
