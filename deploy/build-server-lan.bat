@echo off
chcp 65001 >nul 2>&1
title 🔨 构建 Aura Server → 内网 Windows 部署
setlocal EnableExtensions EnableDelayedExpansion

echo ==================================================
echo   🔨 构建 Aura 智能体平台 Server 内网版本
echo   ^(Next.js Standalone + Node.js + WinSW^)
echo ==================================================
echo.

:: ========== 📌 内网部署参数（按需修改） ==========
set "DB_HOST=localhost"
set "DB_PORT=5432"
set "DB_USER=root"
set "DB_PASSWORD=root"
set "DB_NAME=aura_db"
set "SERVER_PORT=8086"
set "DEPLOY_DIR=D:\app\aura-server"
:: ====================================================

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
echo [1/7] 📋 校验项目文件...
if not exist "web-aura-next\package.json" (
    echo ❌ 未找到 web-aura-next\package.json！
    pause
    exit /b 1
)
echo ✅ 项目文件就绪
echo.

echo 📌 内网部署参数:
echo    DB: %DB_HOST%:%DB_PORT%/%DB_NAME%  ^(用户: %DB_USER%^)
echo    Server Port: %SERVER_PORT%
echo    Deploy Dir:  %DEPLOY_DIR%
echo.

:: ========== Step 2: 检查 Node.js ==========
echo [2/7] 🔍 检查 Node.js 环境...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js 未找到，请先安装 Node.js 20+ LTS：
    echo   https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo ✅ Node.js 已就绪 ^(版本: !NODE_VER!^)
echo.

:: ========== Step 3: 安装依赖 & 构建 ==========
echo [3/7] ⚡ 安装依赖并构建生产版本...
echo.
cd /d "%PROJECT_ROOT%\web-aura-next"

echo   执行: npm install
call npm install
if %errorlevel% neq 0 (
    echo.
    echo ❌ 依赖安装失败！
    cd /d "%PROJECT_ROOT%"
    pause
    exit /b 1
)
echo.

echo   执行: npm run build ^(Next.js Standalone 模式^)
call npm run build
set BUILD_RESULT=%errorlevel%

if %BUILD_RESULT% neq 0 (
    echo.
    echo ❌ Next.js 构建失败！请检查代码和配置。
    cd /d "%PROJECT_ROOT%"
    pause
    exit /b 1
)
echo.
echo ✅ 构建完成
echo.

:: ========== Step 4: 复制 standalone 产物到输出目录 ==========
echo [4/7] 📦 组装 Standalone 部署包到 bin\aura-server\ ...

set "OUT_DIR=%PROJECT_ROOT%\bin\aura-server"
set "STANDALONE_SRC=%PROJECT_ROOT%\web-aura-next\.next\standalone"

if not exist "%STANDALONE_SRC%" (
    echo ❌ 未找到 standalone 构建产物: %STANDALONE_SRC%
    cd /d "%PROJECT_ROOT%"
    pause
    exit /b 1
)

:: 清理并创建输出目录
if exist "%OUT_DIR%" rmdir /s /q "%OUT_DIR%"
mkdir "%OUT_DIR%" >nul 2>&1

:: 复制 standalone 全部内容（server.js + node_modules + 精简源码）
echo   [COPY] .next\standalone\* ...
xcopy "%STANDALONE_SRC%\*" "%OUT_DIR%\" /E /I /Q /H /Y >nul
echo   ✅ standalone 核心已复制

:: 清理服务端不需要的文件（Tauri 桌面壳 / 源码文档 / 构建配置）
if exist "%OUT_DIR%\src-tauri" (
    rmdir /s /q "%OUT_DIR%\src-tauri" >nul 2>&1
    echo   🧹 已清理 src-tauri\
)
if exist "%OUT_DIR%\out" (
    rmdir /s /q "%OUT_DIR%\out" >nul 2>&1
    echo   🧹 已清理 out\ ^(Tauri 前端产物^)
)
if exist "%OUT_DIR%\scripts" (
    rmdir /s /q "%OUT_DIR%\scripts" >nul 2>&1
    echo   🧹 已清理 scripts\
)
for %%f in (AGENTS.md CLAUDE.md README.md eslint.config.mjs next.config.ts postcss.config.mjs drizzle.config.ts tsconfig.json tsconfig.tsbuildinfo package.json package-lock.json) do (
    if exist "%OUT_DIR%\%%f" del /q "%OUT_DIR%\%%f" >nul 2>&1
)
echo   🧹 已清理 AGENTS.md / README.md / eslint / tsconfig / package.json 等

:: 复制 public 静态资源
set "PUBLIC_SRC=%PROJECT_ROOT%\web-aura-next\public"
if exist "%PUBLIC_SRC%" (
    set "PUBLIC_DST=%OUT_DIR%\public"
    if not exist "!PUBLIC_DST!" mkdir "!PUBLIC_DST!" >nul 2>&1
    xcopy "%PUBLIC_SRC%\*" "!PUBLIC_DST!\" /E /I /Q /H /Y >nul
    echo   ✅ public\ 静态资源已复制
) else (
    echo   ⚠️  public\ 目录不存在，跳过
)

:: 复制 .next/static 到 standalone 内
set "STATIC_SRC=%PROJECT_ROOT%\web-aura-next\.next\static"
if exist "%STATIC_SRC%" (
    set "STATIC_DST=%OUT_DIR%\.next\static"
    if not exist "!STATIC_DST!" mkdir "!STATIC_DST!" >nul 2>&1
    xcopy "%STATIC_SRC%\*" "!STATIC_DST!\" /E /I /Q /H /Y >nul
    echo   ✅ .next\static\ 已复制
) else (
    echo   ⚠️  .next\static\ 目录不存在，跳过
)

echo.
:: 补偿 Next.js 文件追踪：某些包有静态资源（json/bin/node 等），
:: tracer 只追踪 JS import 链，非 JS 文件会被剪裁导致运行时报
:: "Cannot find module"。这里用 dev 版完整 node_modules 直接覆写。
echo   [FIX] 覆写被剪裁的 node_modules 包...
set "SRC_NM=%PROJECT_ROOT%\web-aura-next\node_modules"
set "DST_NM=%OUT_DIR%\node_modules"
for %%p in (playwright-core drizzle-orm) do (
    if exist "!SRC_NM!\%%p\" (
        if exist "!DST_NM!\%%p\" rmdir /s /q "!DST_NM!\%%p" >nul 2>&1
        xcopy "!SRC_NM!\%%p\" "!DST_NM!\%%p\" /E /I /Q /H /Y >nul
        echo     ✅ %%p 完整覆写
    )
)

:: ========== Step 5: 生成 .env 环境变量文件 ==========
echo [5/7] ⚙️  生成运行时环境变量文件...

:: 构建 DATABASE_URL 连接串（PostgreSQL）
set "DATABASE_URL=postgresql://%DB_USER%:%DB_PASSWORD%@%DB_HOST%:%DB_PORT%/%DB_NAME%"

(
echo # Aura 智能体平台 - 内网部署环境变量
echo # 由 build-server-lan.bat 自动生成
echo.
echo DATABASE_URL=%DATABASE_URL%
echo PORT=%SERVER_PORT%
echo NODE_ENV=production
) > "%OUT_DIR%\.env"

echo   ✅ .env 已生成
echo      DATABASE_URL: %DATABASE_URL%
echo      PORT:         %SERVER_PORT%
echo.

:: ========== Step 6: 生成 WinSW 服务定义文件 ==========
echo [6/7] ⚙️  生成 WinSW 服务定义文件...
echo   工作目录: %DEPLOY_DIR%

:: 检测 Node.js 完整路径（WinSW 以 SYSTEM 账户运行时 PATH 可能不含用户安装的 Node.js）
for /f "tokens=*" %%i in ('where node') do set "NODE_FULL_PATH=%%i"
if not defined NODE_FULL_PATH set "NODE_FULL_PATH=node"
echo   检测到 Node.js: !NODE_FULL_PATH!

:: ---- AuraServer.xml (workingdirectory 指向生产部署目录) ----
:: WinSW 环境变量中路径反斜杠需转义为 \\，批处理中写四个斜杠 \\\\
(
echo ^<service^>
echo   ^<id^>aura-server^</id^>
echo   ^<name^>Aura 智能体平台服务^</name^>
echo   ^<description^>Aura Next.js Standalone 全栈服务 ^(Node.js 20+^)^</description^>
echo   ^<executable^>!NODE_FULL_PATH!^</executable^>
echo   ^<arguments^>server.js^</arguments^>
echo   ^<workingdirectory^>%DEPLOY_DIR:\=\\%^</workingdirectory^>
echo   ^<env name="DATABASE_URL" value="%DATABASE_URL%"/^>
echo   ^<env name="PORT" value="%SERVER_PORT%"/^>
echo   ^<env name="NODE_ENV" value="production"/^>
echo   ^<log mode="roll-by-size"^>
echo     ^<sizeThreshold^>10240^</sizeThreshold^>
echo     ^<keepFiles^>8^</keepFiles^>
echo   ^</log^>
echo   ^<onfailure action="restart" delay="10 sec"/^>
echo   ^<resetfailure^>1 hour^</resetfailure^>
echo ^</service^>
) > "%OUT_DIR%\AuraServer.xml"

echo   ✅ AuraServer.xml 已生成 ^(workingdirectory=%DEPLOY_DIR%^)
echo.

:: ========== Step 7: 复制 WinSW ==========
echo [7/7] 📝 复制 WinSW 可执行文件...

:: ---- 复制 WinSW 可执行文件 ----
set "WINSW_SRC=%PROJECT_ROOT%\deploy\WinSW-x64.exe"
set "WINSW_DST=%OUT_DIR%\AuraServer.exe"

if exist "%WINSW_SRC%" (
    copy /y "%WINSW_SRC%" "%WINSW_DST%" >nul
    echo   deploy\WinSW-x64.exe → bin\aura-server\AuraServer.exe
    echo   ✅ WinSW 已自动部署
) else (
    echo   ⚠️  未找到 deploy\WinSW-x64.exe，请从以下地址下载后放入 deploy 目录:
    echo      https://github.com/winsw/winsw/releases
)
echo.

:: ========== 输出完成信息 ==========
echo ==================================================
echo   🏁  构建完成！内网 Aura Server 版本
echo ==================================================
echo.
echo   📌 构建产物目录: bin\aura-server\
echo         ├── AuraServer.exe         ^(WinSW 可执行文件^)
echo         ├── AuraServer.xml         ^(WinSW 服务定义^)
echo         ├── server.js              ^(Next.js Standalone 入口^)
echo         ├── node_modules\          ^(生产依赖^)
echo         ├── .next\                 ^(编译产物 + 静态资源^)
echo         ├── public\                ^(静态资源^)
echo         ├── src\                   ^(API 路由源码 + migrate.cjs^)
echo         ├── drizzle\               ^(数据库迁移 SQL^)
echo         └── .env                   ^(环境变量^)
echo.
echo   📌 部署步骤 ^(详见 docs\建构打包和生产部署指引.md^):
echo       1. 将 bin\aura-server\ 下所有文件复制到 %DEPLOY_DIR%\
echo       2. 【首次/表结构变更时】执行数据库迁移: node src\lib\db\migrate.cjs
echo       3. 以管理员身份打开 cmd，cd /d %DEPLOY_DIR%
echo       4. 安装并启动服务:
echo             AuraServer.exe install
echo             AuraServer.exe start
echo       5. 浏览器验证: http://localhost:%SERVER_PORT%
echo.
echo   📌 WinSW 服务管理 ^(在 %DEPLOY_DIR% 目录以管理员身份执行^):
echo       安装:   AuraServer.exe install
echo       启动:   AuraServer.exe start
echo       停止:   AuraServer.exe stop
echo       卸载:   AuraServer.exe uninstall
echo       状态:   AuraServer.exe status
echo       重启:   AuraServer.exe restart
echo       日志:   %DEPLOY_DIR%\AuraServer.wrapper.log
echo.
echo   💡 修改参数: 编辑本 bat 头部 set 变量，重新构建即可
echo   💡 数据库请单独启动 ^(docker-pgvector-start.bat 或 docker-compose^)
echo ==================================================
echo.

cd /d "%PROJECT_ROOT%"
pause
exit /b 0
