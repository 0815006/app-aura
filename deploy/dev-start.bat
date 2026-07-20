@echo off
SETLOCAL EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1

echo ========================================
echo   Aura 智能体平台 - 本地开发环境启动
echo   ^(PostgreSQL 请确保已启动: localhost:5432^)
echo ========================================
echo.
echo [预检] 当前目录: %CD%
echo [预检] 脚本目录: %~dp0
echo.

REM ---- 0. 检查 Node.js / npm 是否可用 ----
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] Node.js 未找到，请先安装 Node.js 20+ LTS：
    echo   https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo [预检] Node.js / npm 已就绪
echo.

REM ---- 1. 切换到工程根目录 ----
cd /d "%~dp0..\web-aura-next"
if %errorlevel% neq 0 (
    echo [错误] 无法进入 web-aura-next 目录
    pause
    exit /b 1
)

REM ---- 2. 安装依赖 ----
echo [1/3] 安装依赖 ^(npm install^)...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [错误] 依赖安装失败！
    pause
    exit /b 1
)

REM ---- 3. 数据库自动迁移 (对标 Flyway) ----
echo.
echo [2/3] 执行数据库迁移 ^(Drizzle Kit^)...
echo   确保 PostgreSQL 已在 localhost:5432 运行...
call npx tsx src/lib/db/migrate.ts
if %errorlevel% neq 0 (
    echo [警告] 数据库迁移失败，但继续启动服务...
)
echo.

REM ---- 4. 启动开发服务器 ----
echo [3/3] 启动 Next.js 开发服务器 ^(http://localhost:8086^)...
echo ========================================
echo.
start http://localhost:8086
call npm run dev

REM ---- 服务器停止后 ----
echo.
echo [Aura] 开发服务器已停止。
pause
