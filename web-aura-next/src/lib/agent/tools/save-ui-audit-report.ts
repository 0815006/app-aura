/**
 * UI 审计报告保存工具 — save_ui_audit_report
 *
 * 接收 Agent 在 CoT 中完成的语义比对结果，格式化为银行合规审计报告，
 * 写入工作空间 outputs/ui-test/ 目录。
 *
 * 同时生成结构化差异 JSON 供下游自动化流水线消费。
 */
import { tool } from "ai";
import { z } from "zod/v4";
import { resolveWorkspaceAwarePath } from "@/lib/agent/tool-context";
import fs from "fs";
import path from "path";

// ============================================================
// Zod Schema
// ============================================================

const textElementSchema = z.object({
  expectedText: z.string().describe("原型要求的文本（如按钮文案、标签文字）"),
  elementType: z
    .enum([
      "label",
      "button",
      "input_placeholder",
      "heading",
      "validation_message",
      "link",
    ])
    .describe("元素类型"),
  actualText: z.string().optional().describe("页面上实际抓取到的文本"),
  status: z
    .enum(["MATCHED", "MISSING", "TEXT_MISMATCH"])
    .describe("比对状态"),
  severity: z
    .enum(["Low", "Medium", "Blocker"])
    .describe("风险等级：Blocker=合规红线缺失，Medium=文案不一致，Low=非关键差异"),
  comment: z.string().optional().describe("审计意见"),
});

const interactiveElementSchema = z.object({
  elementType: z
    .enum(["button", "link", "input", "select", "modal_trigger"])
    .describe("交互元素类型"),
  expectedLabel: z.string().describe("原型要求的交互元素标签"),
  actualLabel: z.string().optional().describe("页面上实际的交互元素标签"),
  status: z
    .enum(["MATCHED", "MISSING", "TEXT_MISMATCH"])
    .describe("比对状态"),
});

const routeValidationSchema = z.object({
  expectedRoute: z.string().describe("设计文档中的预期路由，如 /transfer/confirm"),
  actualRoute: z.string().describe("浏览器实际所在的 URL"),
  isMatch: z.boolean().describe("路由是否匹配"),
  comment: z.string().optional().describe("路由校验备注"),
});

// ============================================================
// 报告生成
// ============================================================

function generateMarkdownReport(params: {
  reportTitle: string;
  targetEnv: string;
  specSource: string;
  overallVerdict: "PASSED" | "FAILED" | "WARNING";
  textElements: z.infer<typeof textElementSchema>[];
  interactiveElements?: z.infer<typeof interactiveElementSchema>[];
  routeValidation?: z.infer<typeof routeValidationSchema>;
  generatedAt: string;
  auditStandard: string;
}): string {
  const {
    reportTitle,
    targetEnv,
    specSource,
    overallVerdict,
    textElements,
    interactiveElements,
    routeValidation,
    generatedAt,
    auditStandard,
  } = params;

  const matchedCount = textElements.filter(
    (e) => e.status === "MATCHED"
  ).length;
  const missingCount = textElements.filter(
    (e) => e.status === "MISSING"
  ).length;
  const mismatchCount = textElements.filter(
    (e) => e.status === "TEXT_MISMATCH"
  ).length;
  const blockerCount = textElements.filter(
    (e) => e.severity === "Blocker"
  ).length;
  const totalCount = textElements.length;

  const verdictEmoji =
    overallVerdict === "PASSED"
      ? "✅ 通过"
      : overallVerdict === "FAILED"
        ? "❌ 不通过"
        : "⚠️ 警告";

  const statusEmoji: Record<string, string> = {
    MATCHED: "✓",
    MISSING: "✗",
    TEXT_MISMATCH: "⚠",
  };

  const severityLabel: Record<string, string> = {
    Low: "低",
    Medium: "中",
    Blocker: "🔴 阻断",
  };

  const elementTypeLabel: Record<string, string> = {
    label: "标签文本",
    button: "按钮文案",
    input_placeholder: "输入框占位符",
    heading: "标题",
    validation_message: "校验提示",
    link: "链接文本",
  };

  // 构建报告
  let report = "";
  report += `# ${reportTitle}\n\n`;
  report += `**比对目标环境：** ${targetEnv}\n`;
  report += `**判定行业规范：** ${auditStandard}\n`;
  report += `**审计时间：** ${generatedAt}\n`;
  report += `**原型契约来源：** ${specSource}\n\n`;
  report += `---\n\n`;

  // 一、审计结论摘要
  report += `## 一、审计结论摘要\n\n`;
  report += `经过对原型契约与目标系统真实界面的自动化抓取比对，本次评审结果为：**${verdictEmoji}**。\n\n`;
  if (blockerCount > 0) {
    report += `⚠️ 发现 **${blockerCount}** 处阻断级别缺陷。\n\n`;
  }

  report += `- **比对要素总数：** ${totalCount} 个\n`;
  report += `- **完全对齐数量：** ${matchedCount} 个\n`;
  report += `- **差异/缺失数量：** ${missingCount + mismatchCount} 个`;
  if (missingCount > 0) report += `（缺失 ${missingCount}，不一致 ${mismatchCount}）`;
  report += `\n\n---\n\n`;

  // 二、界面要素比对明细矩阵
  report += `## 二、界面要素比对明细矩阵\n\n`;
  report += `| 序号 | 原型要求元素 | 元素类型 | 实际界面抓取 | 比对状态 | 风险等级 | 审计意见 |\n`;
  report += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  textElements.forEach((el, i) => {
    const actual =
      el.actualText && el.status !== "MISSING"
        ? el.actualText
        : el.status === "MISSING"
          ? "未探测到"
          : "—";
    report += `| ${i + 1} | ${el.expectedText} | ${elementTypeLabel[el.elementType] ?? el.elementType} | ${actual} | ${statusEmoji[el.status]} ${el.status} | ${severityLabel[el.severity]} | ${el.comment ?? "—"} |\n`;
  });

  // 交互元素
  if (interactiveElements && interactiveElements.length > 0) {
    report += `\n### 2.1 交互元素校验\n\n`;
    report += `| 序号 | 元素类型 | 期望标签 | 实际标签 | 状态 |\n`;
    report += `| :--- | :--- | :--- | :--- | :--- |\n`;
    interactiveElements.forEach((el, i) => {
      report += `| ${i + 1} | ${el.elementType} | ${el.expectedLabel} | ${el.actualLabel ?? "未探测到"} | ${statusEmoji[el.status]} ${el.status} |\n`;
    });
  }

  report += `\n---\n\n`;

  // 三、路由与流转合规性
  if (routeValidation) {
    report += `## 三、路由与流转合规性\n\n`;
    report += `- **预期目标路由：** \`${routeValidation.expectedRoute}\`\n`;
    report += `- **实际抓取路由：** \`${routeValidation.actualRoute}\`\n`;
    report += `- **匹配结果：** ${routeValidation.isMatch ? "✅ 流转正确" : "❌ 路由不匹配"}\n`;
    if (routeValidation.comment) {
      report += `- **备注：** ${routeValidation.comment}\n`;
    }
    report += `\n---\n\n`;
  }

  // 四、统计汇总
  report += `## 四、统计汇总\n\n`;
  report += `| 状态 | 数量 | 占比 |\n`;
  report += `| :--- | :--- | :--- |\n`;
  report += `| MATCHED | ${matchedCount} | ${((matchedCount / totalCount) * 100).toFixed(1)}% |\n`;
  report += `| MISSING | ${missingCount} | ${((missingCount / totalCount) * 100).toFixed(1)}% |\n`;
  report += `| TEXT_MISMATCH | ${mismatchCount} | ${((mismatchCount / totalCount) * 100).toFixed(1)}% |\n`;
  report += `| **合计** | **${totalCount}** | **100%** |\n`;

  if (blockerCount > 0) {
    report += `\n### ⚠️ 阻断项清单\n\n`;
    textElements
      .filter((e) => e.severity === "Blocker")
      .forEach((el) => {
        report += `- **${el.expectedText}** → ${el.status}：${el.comment ?? "无备注"}\n`;
      });
  }

  report += `\n---\n`;
  report += `*报告由 Aura UI 原型契约与自动化校验专家自动生成*\n`;

  return report;
}

// ============================================================
// 工具定义
// ============================================================

export const saveUiAuditReport = tool({
  description:
    "对比原型契约要求与实际抓取的页面文本，生成银行合规审计报告（Markdown + JSON），持久化到工作空间 outputs/ui-test/ 目录。",
  parameters: z.object({
    reportTitle: z
      .string()
      .describe("审计报告标题，如 '转账确认页 UI 原型契约校验报告'"),
    targetEnv: z
      .string()
      .describe("测试环境标识，如 '网银测试环境 (UAT-02)'"),
    specSource: z
      .string()
      .describe(
        "原型契约来源，如 'inputs/ui-specs/01_转账确认页_原型要素.json'"
      ),
    overallVerdict: z
      .enum(["PASSED", "FAILED", "WARNING"])
      .describe("整体审计结论"),
    textElements: z
      .array(textElementSchema)
      .describe("文本要素比对清单：原型要求文本 vs 页面实际文本"),
    interactiveElements: z
      .array(interactiveElementSchema)
      .optional()
      .describe("交互元素校验结果（按钮、链接等可操作组件）"),
    routeValidation: routeValidationSchema
      .optional()
      .describe("路由合规性校验结果"),
    auditStandard: z
      .string()
      .optional()
      .default("软件质量度量标准 (ISO/IEC 25010 - 易用性与界面符合度)")
      .describe("审计依据的行业标准"),
    playwrightScript: z
      .string()
      .optional()
      .describe("可选：Agent 生成的 Playwright 自动化脚本，一并保存供测试人员复用"),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (params: {
    reportTitle: string;
    targetEnv: string;
    specSource: string;
    overallVerdict: "PASSED" | "FAILED" | "WARNING";
    textElements: z.infer<typeof textElementSchema>[];
    interactiveElements?: z.infer<typeof interactiveElementSchema>[];
    routeValidation?: z.infer<typeof routeValidationSchema>;
    auditStandard?: string;
    playwrightScript?: string;
  }): Promise<string> => {
    const {
      reportTitle,
      targetEnv,
      specSource,
      overallVerdict,
      textElements,
      interactiveElements,
      routeValidation,
      auditStandard,
      playwrightScript,
    } = params;

    const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
    const standard = auditStandard ?? "软件质量度量标准 (ISO/IEC 25010)";

    try {
      // 1. 生成 Markdown 报告
      const markdown = generateMarkdownReport({
        reportTitle,
        targetEnv,
        specSource,
        overallVerdict,
        textElements,
        interactiveElements,
        routeValidation,
        generatedAt,
        auditStandard: standard,
      });

      // 2. 生成结构化差异 JSON
      const diffJson = {
        version: "1.0",
        reportTitle,
        targetEnv,
        specSource,
        overallVerdict,
        auditStandard: standard,
        generatedAt,
        summary: {
          total: textElements.length,
          matched: textElements.filter((e) => e.status === "MATCHED").length,
          missing: textElements.filter((e) => e.status === "MISSING").length,
          mismatch: textElements.filter(
            (e) => e.status === "TEXT_MISMATCH"
          ).length,
          blocker: textElements.filter((e) => e.severity === "Blocker").length,
        },
        textElements,
        interactiveElements: interactiveElements ?? [],
        routeValidation: routeValidation ?? null,
      };

      // 3. 确保输出目录存在并写入文件
      const mdPath = resolveWorkspaceAwarePath(
        "outputs/ui-test/01_UI界面合规性比对报告.md"
      );
      const jsonPath = resolveWorkspaceAwarePath(
        "outputs/ui-test/02_UI审计差异明细.json"
      );

      const mdDir = path.dirname(mdPath);
      if (!fs.existsSync(mdDir)) {
        fs.mkdirSync(mdDir, { recursive: true });
      }

      fs.writeFileSync(mdPath, markdown, "utf-8");
      fs.writeFileSync(jsonPath, JSON.stringify(diffJson, null, 2), "utf-8");

      const outputs: string[] = [
        `outputs/ui-test/01_UI界面合规性比对报告.md`,
        `outputs/ui-test/02_UI审计差异明细.json`,
      ];

      // 4. 可选：保存 Playwright 脚本
      if (playwrightScript) {
        const scriptPath = resolveWorkspaceAwarePath(
          "outputs/ui-test/ui_playwright_script.spec.js"
        );
        fs.writeFileSync(scriptPath, playwrightScript, "utf-8");
        outputs.push(`outputs/ui-test/ui_playwright_script.spec.js`);
      }

      return JSON.stringify({
        success: true,
        generatedAt,
        overallVerdict,
        summary: diffJson.summary,
        files: outputs,
        message: `审计报告已固化到工作空间 outputs/ui-test/ 目录（${outputs.length} 个文件）`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      return JSON.stringify({
        success: false,
        error: `保存 UI 审计报告失败: ${message}`,
      });
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
