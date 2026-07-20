/**
 * Tauri 前端产物准备脚本
 *
 * Next.js output: "standalone" 模式下，预渲染的 HTML 页面在 .next/server/app/*.html，
 * JS/CSS 静态资源在 .next/static/。
 *
 * 本脚本将这些文件复制到 out/ 目录，供 Tauri 打包时通过 frontendDist 引用。
 * Tauri WebView 通过 _next/static/ 路径加载 JS/CSS，需要在 out/ 中维持此结构。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const NEXT_DIR = path.join(ROOT, ".next");
const OUT_DIR = path.join(ROOT, "out");
const PUBLIC_DIR = path.join(ROOT, "public");

// 清理并创建 out/ 目录
if (fs.existsSync(OUT_DIR)) {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
}
fs.mkdirSync(OUT_DIR, { recursive: true });

// 1. 复制预渲染的 HTML 页面（.next/server/app/*.html → out/）
const serverAppDir = path.join(NEXT_DIR, "server", "app");
if (fs.existsSync(serverAppDir)) {
  const htmlFiles = fs.readdirSync(serverAppDir).filter((f) => f.endsWith(".html"));
  console.log(`📄 找到 ${htmlFiles.length} 个预渲染 HTML 页面`);
  for (const file of htmlFiles) {
    fs.copyFileSync(path.join(serverAppDir, file), path.join(OUT_DIR, file));
    console.log(`   ${file}`);
  }
} else {
  console.error("❌ 未找到 .next/server/app/ 目录，请先运行 next build");
  process.exit(1);
}

// 2. 复制静态资源（.next/static/ → out/_next/static/）
const staticSrc = path.join(NEXT_DIR, "static");
const staticDst = path.join(OUT_DIR, "_next", "static");
if (fs.existsSync(staticSrc)) {
  fs.mkdirSync(path.dirname(staticDst), { recursive: true });
  copyDirSync(staticSrc, staticDst);
  console.log("📦 静态资源已复制到 out/_next/static/");
} else {
  console.warn("⚠️ 未找到 .next/static/ 目录");
}

// 3. 复制 public/ 目录中的静态文件（favicon, aura.svg 等）
if (fs.existsSync(PUBLIC_DIR)) {
  copyDirSync(PUBLIC_DIR, OUT_DIR);
  console.log("🖼️ public/ 资源已复制到 out/");
}

console.log("✅ Tauri 前端产物准备完成: out/");

/**
 * 递归复制目录
 */
function copyDirSync(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}
