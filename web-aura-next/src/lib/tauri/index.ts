/**
 * Aura 桌面客户端专用 —— Tauri 原生 API 封装
 *
 * Phase 1: 客户端为纯壳，文件操作统一通过服务端 API 代理。
 *          本模块的 Tauri FS/Dialog/Shell 封装保留用于 Phase 2 本地工作空间支持。
 * Phase 2: 客户端模式下，source=local 工作空间通过 Tauri FS API 直接读写用户本地文件。
 *
 * 规范要点：
 * - Phase 2: source=local 工作空间使用 Tauri FS API
 * - 所有操作通过 @tauri-apps/api 调用，不经过服务端工具逻辑
 */

// Tauri API 导入（仅在 Tauri 环境中可用）
// 使用动态 import 避免服务端打包时报模块找不到

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  /** 文件大小（字节），仅文件有效 */
  size?: number;
}

export interface DirListResult {
  path: string;
  entries: FileEntry[];
}

export interface ShellResult {
  code: number;
  stdout: string;
  stderr: string;
}

// ============================================================
// 懒加载 Tauri API（避免非 Tauri 环境报错）
// ============================================================

async function getTauriFs() {
  const mod = await import("@tauri-apps/plugin-fs");
  return mod;
}

async function getTauriDialog() {
  const mod = await import("@tauri-apps/plugin-dialog");
  return mod;
}

async function getTauriCore() {
  const mod = await import("@tauri-apps/api/core");
  return mod;
}

// ============================================================
// 文件系统操作
// ============================================================

/**
 * 列出指定目录下的文件和子目录
 */
export async function listDirectory(dirPath: string): Promise<DirListResult> {
  const { readDir } = await getTauriFs();
  const entries: FileEntry[] = [];
  const rawEntries = await readDir(dirPath);

  for (const entry of rawEntries) {
    entries.push({
      name: entry.name,
      path: `${dirPath}/${entry.name}`.replace(/\\/g, "/"),
      isDirectory: entry.isDirectory ?? false,
      isFile: entry.isFile ?? true,
    });
  }

  return { path: dirPath, entries };
}

/**
 * 读取文本文件内容
 */
export async function readFileContent(filePath: string): Promise<string> {
  const { readTextFile } = await getTauriFs();
  return readTextFile(filePath);
}

/**
 * 写入文本文件
 */
export async function writeFileContent(
  filePath: string,
  content: string
): Promise<void> {
  const { writeTextFile } = await getTauriFs();
  await writeTextFile(filePath, content);
}

/**
 * 检查路径是否存在
 */
export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    const { exists: fsExists } = await getTauriFs();
    return await fsExists(targetPath);
  } catch {
    return false;
  }
}

/**
 * 创建目录（递归）
 */
export async function createDirectory(dirPath: string): Promise<void> {
  const { mkdir } = await getTauriFs();
  await mkdir(dirPath, { recursive: true });
}

/**
 * 删除文件或目录
 */
export async function removePath(targetPath: string): Promise<void> {
  const { remove } = await getTauriFs();
  await remove(targetPath);
}

// ============================================================
// 原生对话框
// ============================================================

/**
 * 打开文件选择对话框
 */
export async function openFileDialog(options?: {
  multiple?: boolean;
  filters?: { name: string; extensions: string[] }[];
}): Promise<string | string[] | null> {
  const { open } = await getTauriDialog();
  return open({
    multiple: options?.multiple ?? false,
    filters: options?.filters,
  });
}

/**
 * 打开目录选择对话框
 */
export async function openFolderDialog(): Promise<string | null> {
  const { open } = await getTauriDialog();
  return open({ directory: true, multiple: false }) as Promise<string | null>;
}

/**
 * 保存文件对话框
 */
export async function saveFileDialog(options?: {
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}): Promise<string | null> {
  const { save } = await getTauriDialog();
  return save({
    defaultPath: options?.defaultPath,
    filters: options?.filters,
  });
}

// ============================================================
// Shell 执行（客户端本地 Shell）
// ============================================================

/**
 * 在客户端本地执行 Shell 命令
 */
export async function executeShell(
  command: string,
  args: string[] = [],
  cwd?: string
): Promise<ShellResult> {
  const { invoke } = await getTauriCore();
  const result = await invoke<ShellResult>("execute_shell", {
    command,
    args,
    cwd: cwd ?? null,
  });
  return result;
}

// ============================================================
// 辅助函数：检测当前环境
// ============================================================

let _isTauriEnv: boolean | null = null;

/**
 * 检测是否运行在 Tauri 环境中
 */
export function isTauri(): boolean {
  if (_isTauriEnv !== null) return _isTauriEnv;

  if (typeof window !== "undefined") {
    _isTauriEnv = !!(
      window as unknown as Record<string, unknown>
    ).__TAURI_INTERNALS__;
  } else {
    _isTauriEnv = false;
  }

  return _isTauriEnv;
}
