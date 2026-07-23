/**
 * Aura 智能体工具箱入口
 *
 * 90% 的核心精力投入于此目录。
 * 所有工具通过 tool() 函数定义，具备完整的 Try-Catch 隔离和超时熔断。
 *
 * 工具分类：
 * 一、文件与目录感知类（Read & Discovery）
 *   1. list_directory       —— 目录探测器
 *   2. preview_file_lines   —— 智能预览器
 *   3. read_file_full       —— 全文读取器
 *
 * 二、资产产出与修改类（Write & Mutation）
 *   4. create_directory          —— 目录创建器
 *   5. write_text_file           —— 基础文本写入
 *   6. generate_structured_excel —— 结构化表格生成
 *
 * 三、动态计算与代码执行类（Sandbox & Compute）
 *   7. execute_python_code —— Python 沙箱执行器
 *
 * 四、外部世界连接类（Connectivity）
 *   8. web_search   —— 实时联网搜索
 *   9. http_request —— 通用网络请求
 */

export { listDirectory } from "./list-directory";
export { previewFileLines } from "./preview-file-lines";
export { readFileFull } from "./read-file-full";
export { createDirectory } from "./create-directory";
export { writeTextFile } from "./write-text-file";
export { executePythonCode } from "./execute-python-code";
export { webSearch } from "./web-search";
export { httpRequest } from "./http-request";
export { updateMemory } from "./update-memory";
export { saveUiAuditReport } from "./save-ui-audit-report";

// ★ 以下工具依赖重量级包（playwright/exceljs/mysql2），仅限 Route Handler
// 服务端代码通过直接导入源文件使用，不在此 barrel 中重新导出。
// 原因：Turbopack dev 模式不认 serverExternalPackages，会尝试捆绑这些包导致 OOM。
//   - generateStructuredExcel  → exceljs
//   - executePlaywrightValidation → playwright (~400MB 含 Chromium)
//   - dbExecuteQuery / dbGetQueryPlan / dbGetTableSchema / dbListSlowQueries / releaseAllPools → mysql2

export type ToolCategory = "dba" | "perf" | "monitor" | "common";
