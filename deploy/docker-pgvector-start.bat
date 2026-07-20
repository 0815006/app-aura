@echo off
SETLOCAL EnableExtensions EnableDelayedExpansion
chcp 65001 >nul 2>&1

echo ========================================
echo   Aura - 启动 PostgreSQL + pgvector
echo ========================================
echo.

REM ---- 0. 检查 Docker 是否运行 ----
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] Docker 未运行，请先启动 Docker Desktop。
    echo.
    pause
    exit /b 1
)
echo [预检] Docker 已就绪
echo.

REM ---- 1. 切换到 deploy 目录并启动 ----
cd /d "%~dp0"
if %errorlevel% neq 0 (
    echo [错误] 无法进入 deploy 目录
    pause
    exit /b 1
)

echo [启动] 正在拉取镜像并启动 PostgreSQL + pgvector 容器...
echo   镜像: pgvector/pgvector:pg16
echo   容器: aura-postgres
echo   端口: 5432:5432
echo   用户: root / 密码: root
echo   数据库: aura_db
echo.

docker-compose up -d postgres
if %errorlevel% equ 0 (
    echo ========================================
    echo   数据库启动成功！
    echo   连接地址: localhost:5432
    echo   连接串: postgresql://root:root@localhost:5432/aura_db
    echo ========================================
    echo.
    echo [提示] 数据库容器将持续运行，关闭本窗口不影响服务。
    echo        如需停止，请执行: docker stop aura-postgres
    echo        如需删除，请执行: docker stop aura-postgres ^&^& docker rm aura-postgres
) else (
    echo ========================================
    echo   [错误] 数据库启动失败，请检查:
    echo   1. Docker Desktop 是否正常运行
    echo   2. 5432 端口是否被占用
    echo ========================================
)

echo.
pause
