/**
 * 将 aura.svg 转换为 Tauri 图标所需的 PNG 源文件（1024x1024）
 * 再用 tauri icon 命令生成所有平台图标
 *
 * 用法: node scripts/generate-icons.js
 * 前提: npm run build && node scripts/prepare-tauri-dist.js 之后
 */

const { Resvg } = require("@resvg/resvg-js");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SVG_PATH = path.resolve(__dirname, "../public/aura.svg");
const ICONS_DIR = path.resolve(__dirname, "../src-tauri/icons");
const SOURCE_PNG = path.join(ICONS_DIR, "source-1024.png");

async function main() {
  // 1. 读取 SVG
  if (!fs.existsSync(SVG_PATH)) {
    console.error("❌ 未找到 aura.svg:", SVG_PATH);
    process.exit(1);
  }
  const svgContent = fs.readFileSync(SVG_PATH, "utf-8");
  console.log("✅ 读取 aura.svg");

  // 2. 渲染为 1024x1024 PNG
  const resvg = new Resvg(svgContent, {
    fitTo: { mode: "width", value: 1024 },
    background: "rgba(0, 0, 0, 0)", // 透明背景
  });
  const pngBuffer = resvg.render().asPng();
  fs.writeFileSync(SOURCE_PNG, pngBuffer);
  console.log("✅ 生成 1024x1024 PNG:", SOURCE_PNG);

  // 3. 调用 tauri icon 生成所有平台图标
  console.log("🎨 正在用 tauri icon 生成所有图标...");
  execSync(`npx tauri icon "${SOURCE_PNG}"`, {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
  });
  console.log("✅ 图标生成完成");

  // 4. 清理临时源文件（可选，保留也无妨）
  // fs.unlinkSync(SOURCE_PNG);
}

main().catch((err) => {
  console.error("❌ 图标生成失败:", err.message);
  process.exit(1);
});
