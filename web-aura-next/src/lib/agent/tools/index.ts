/**
 * Aura 智能体工具箱入口
 *
 * 90% 的核心精力投入于此目录。
 * 所有工具通过 tool() 函数定义，具备完整的 Try-Catch 隔离。
 *
 * 工具分类：
 * - dba/     数据库诊断场景
 * - perf/    性能压测场景
 * - monitor/ 监控告警场景
 */

// 基础 8 大原子工具（后续逐步实现）:
// 1. list_directory(path)     - 目录探测器
// 2. preview_file_lines(path, lines) - 智能预览器
// 3. read_file_full(path)     - 全文读取器
// 4. write_text_file(path, content)   - 基础文本写入
// 5. generate_structured_excel(...)    - 结构化表格生成
// 6. execute_python_code(script)      - Python 沙箱执行器
// 7. web_search(query)        - 实时联网搜索
// 8. http_request(url, ...)   - 通用网络请求

export {};

export type ToolCategory = "dba" | "perf" | "monitor" | "common";
