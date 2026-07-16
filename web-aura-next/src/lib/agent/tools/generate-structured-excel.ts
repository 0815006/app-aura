/**
 * 结构化表格生成 —— generate_structured_excel
 *
 * 接收 JSON 数组，调用 exceljs 库生成 Excel 文件。
 * 大模型只需输出结构化 JSON 数据，由本工具完成 .xlsx 文件物化。
 *
 * ★ DeepSeek 兼容：使用 resolveWorkspaceAwarePath 写入工作空间。
 */
import { tool } from "ai";
import { z } from "zod/v4";
import { resolveWorkspaceAwarePath } from "@/lib/agent/tool-context";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";

export const generateStructuredExcel = tool({
  description:
    "将 JSON 数组数据生成结构化的 Excel (.xlsx) 文件。参数 file_path 是输出路径（相对于工作空间根目录），sheet_name 是工作表名，columns 是列定义，rows 是数据行。适用于生成分析报告、数据导出等场景。",
  parameters: z.object({
    file_path: z
      .string()
      .describe(
        "输出的 .xlsx 文件路径，相对于工作空间根目录，例如 'output/analysis_result.xlsx'"
      ),
    sheet_name: z.string().default("Sheet1").describe("工作表名称"),
    columns: z
      .array(
        z.object({
          header: z.string().describe("列标题"),
          key: z.string().describe("数据字段名（对应行数据中的 key）"),
          width: z.number().optional().describe("列宽（可选，默认 20）"),
        })
      )
      .describe("列定义数组，每列包含 header（列标题）和 key（字段名）"),
    rows: z
      .array(z.record(z.string(), z.unknown()))
      .describe(
        "数据行数组，每行为一个 Record<string, any>，key 对应 columns 中定义的字段名"
      ),
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: async (args: any): Promise<string> => {
    try {
      // ★ DeepSeek 兼容：接受 file_path 或 filePath
      const filePath: string = args.file_path ?? args.filePath ?? "";
      const sheetName: string = args.sheet_name ?? args.sheetName ?? "Sheet1";
      const columns: { header: string; key: string; width?: number }[] =
        args.columns ?? [];
      const rows: Record<string, unknown>[] = args.rows ?? [];

      if (!filePath) {
        return JSON.stringify({
          status: "error",
          error: "generate_structured_excel 失败: 缺少 file_path 参数",
        });
      }

      // ★ 使用 workspace-aware 路径解析（而非 DATA_ROOT 回退）
      const safePath = resolveWorkspaceAwarePath(filePath);

      const parentDir = path.dirname(safePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(sheetName);

      sheet.columns = columns.map((col) => ({
        header: col.header,
        key: col.key,
        width: col.width ?? 20,
      }));

      for (const row of rows) {
        sheet.addRow(row);
      }

      // 表头样式美化
      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true, size: 12, color: { argb: "FFE2E8F0" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E293B" },
      };

      // 所有单元格加边框
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sheet.eachRow((row: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        row.eachCell((cell: any) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
      });

      await workbook.xlsx.writeFile(safePath);
      const stat = fs.statSync(safePath);

      return JSON.stringify({
        status: "success",
        filePath,
        sheetName,
        rowCount: rows.length,
        columnCount: columns.length,
        fileSize: stat.size,
        message: `Excel 文件已生成: ${filePath} (${stat.size} bytes, ${rows.length} 行)`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      return JSON.stringify({
        status: "error",
        error: `generate_structured_excel 失败: ${message}`,
      });
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);
