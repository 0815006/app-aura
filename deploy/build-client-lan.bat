@echo off
chcp 65001 >nul 2>&1
title 🔨 打包 Aura 桌面客户端 → 内网部署
setlocal enabledelayedexpansion

:: =================================================================
::   📌 内网地址参数 → 编辑 web-aura-next\.env.lan
::      AURA_MODE=client
::      AURA_SERVER_URL=http://22.188.9.15:8086
::      （客户端通过该地址连接内网 Aura Server）
:: =================================================================

echo ==================================================
echo   🔨 构建 Aura 桌面客户端（内网 LAN 版本）
echo ==================================================
echo.

:: 切到项目根目录
set "PROJECT_ROOT=%~dp0.."
cd /d "%PROJECT_ROOT%"
if %errorlevel% neq 0 (
    echo ❌ 无法进入项目根目录！
    pause
    exit /b 1
)
echo 📁 项目根目录: %cd%
echo.

:: ========== Step 1: 校验项目文件 ==========
echo [1/5] 📋 校验项目文件...
if not exist "web-aura-next\package.json" (
    echo ❌ 未找到 web-aura-next\package.json！
    pause
    exit /b 1
)
if not exist "web-aura-next\.env.lan" (
    echo ❌ 未找到 web-aura-next\.env.lan！
    echo.
    echo 💡 请先创建 .env.lan 并修改 AURA_SERVER_URL 为实际服务器 IP
    pause
    exit /b 1
)
if not exist "web-aura-next\src-tauri\tauri.conf.json" (
    echo ❌ 未找到 web-aura-next\src-tauri\tauri.conf.json！
    pause
    exit /b 1
)
echo ✅ 所有源文件就绪
echo.

:: ========== Step 2: 预览并确认配置 ==========
echo [2/5] 📋 预览内网客户端配置（.env.lan）...
echo ----------------------------------------
type "web-aura-next\.env.lan"
echo ----------------------------------------
echo.

:: 提取服务端地址用于后续提示
for /f "tokens=2 delims==" %%a in ('type "web-aura-next\.env.lan" ^| findstr /c:"AURA_SERVER_URL="') do set "SERVER_URL=%%a"
echo 🎯 目标服务端: %SERVER_URL%
echo.

:: ========== Step 3: 检查 Rust / Node 环境 ==========
echo [3/5] 🔍 检查构建环境...

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js 未找到，请先安装 Node.js 20+ LTS
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo   ✅ Node.js %NODE_VER%

where cargo >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Rust / Cargo 未找到，请先安装: https://rustup.rs/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('cargo --version') do set CARGO_VER=%%i
echo   ✅ %CARGO_VER%
echo.

:: ========== Step 4: 注入内网配置，构建 Tauri 客户端 ==========
echo [4/5] ⚡ 编译 Tauri 桌面客户端（内网版本）...

cd /d "%PROJECT_ROOT%\web-aura-next"

:: 从 .env.lan 读取变量，注入当前进程环境变量
:: Tauri 的 beforeBuildCommand（next build + prepare-tauri-dist.js）会继承这些变量
:: Next.js 通过 next.config.ts 的 env 字段将 AURA_MODE / AURA_SERVER_URL 内联到 bundle
for /f "tokens=1,* delims==" %%a in ('type ".env.lan" ^| findstr /v /b "#"') do (
    set "%%a=%%b"
    echo   注入 %%a=%%b
)
echo   ✅ 内网环境变量已注入
echo   📦 构建流程: next build (standalone) → prepare-tauri-dist.js → tauri build
echo.

echo ==================================================
echo   Tauri 正在编译（首次约 5-15 分钟）...
echo   如卡住不动是正常的（Rust 正在编译依赖）
echo   目标服务端: %SERVER_URL%
echo ==================================================
echo.

call npm run tauri build
set BUILD_RESULT=%errorlevel%

if %BUILD_RESULT% neq 0 (
    echo.
    echo ==================================================
    echo   ❌ Tauri 打包失败！错误码: %BUILD_RESULT%
    echo ==================================================
    echo.
    echo   常见原因:
    echo     1. 缺少 Visual Studio Build Tools ^(C++ 工具链^)
    echo     2. 缺少 WebView2 Runtime ^(Win10 以下^)
    echo     3. Rust 版本过旧: rustup update
    echo     4. node_modules 未安装: npm install
    echo     5. Next.js 构建失败 ^(检查代码错误^)
    echo.
    pause
    exit /b 1
)
echo.
echo ✅ Tauri 编译完成
echo.

:: ========== Step 5: 汇总产物到 bin\aura-client\ ==========
echo [5/5] 📋 汇总构建产物...

set "SRC_EXE=%PROJECT_ROOT%\web-aura-next\src-tauri\target\release\aura-client.exe"
set "SRC_BUNDLE=%PROJECT_ROOT%\web-aura-next\src-tauri\target\release\bundle"
set "OUT_DIR=%PROJECT_ROOT%\bin\aura-client"

:: 确保输出目录存在
if not exist "%OUT_DIR%" mkdir "%OUT_DIR%" >nul 2>&1

:: 复制免安装 exe
if exist "%SRC_EXE%" (
    echo   复制 aura-client.exe → %OUT_DIR%\
    copy /y "%SRC_EXE%" "%OUT_DIR%\aura-client.exe" >nul
) else (
    echo   ⚠️ 未找到 aura-client.exe（可能 Rust 编译产物路径有变）
)

:: 复制 MSI 安装包
if exist "%SRC_BUNDLE%\msi\" (
    for %%f in ("%SRC_BUNDLE%\msi\*.msi") do (
        echo   复制 %%~nxf → %OUT_DIR%\
        copy /y "%%f" "%OUT_DIR%\" >nul
    )
) else (
    echo   ⚠️ 未找到 MSI 安装包
)

:: 复制 NSIS 安装包（Tauri 2.x 的 setup.exe 在 bundle\nsis\ 下）
if exist "%SRC_BUNDLE%\nsis\" (
    for %%f in ("%SRC_BUNDLE%\nsis\*-setup.exe") do (
        echo   复制 %%~nxf → %OUT_DIR%\
        copy /y "%%f" "%OUT_DIR%\" >nul
    )
) else (
    echo   ⚠️ 未找到 NSIS 安装包
)

echo.
echo ==================================================
echo   🏁  构建完成！内网 Aura 桌面客户端
echo ==================================================
echo.
echo   📌 最终产物目录: %OUT_DIR%\
if exist "%OUT_DIR%\aura-client.exe" (
    echo         ├── aura-client.exe       ^(绿色免安装版^)
)
if exist "%OUT_DIR%\*.msi" (
    echo         ├── Aura_*.msi            ^(MSI 安装包^)
)
if exist "%OUT_DIR%\*-setup.exe" (
    echo         └── Aura_*-setup.exe      ^(安装引导程序^)
)
echo.
echo   📌 安装方式（任选其一）:
echo       1. 直接运行 aura-client.exe（免安装绿色版）
echo       2. 双击 Aura_*.msi 安装到系统
echo.
echo   📌 客户端会自动连接: %SERVER_URL%
echo.
echo   💡 如果部署到不同服务器，请:
echo       1. 修改 web-aura-next\.env.lan 中的 AURA_SERVER_URL
echo       2. 重新运行本脚本
echo ==================================================
echo.

cd /d "%PROJECT_ROOT%"
pause
exit /b 0
