@echo off
chcp 65001 >nul 2>&1
title 🔨 构建 Web 版本 → 内网部署
setlocal

echo ==================================================
echo   🔨 构建 Web 内网版本（一个 exe 跑全部）
echo ==================================================
echo.

:: ========== 📌 内网部署参数（改内网只改这里） ==========
set "CHAT_SERVER_MODE=release"
set "DB_HOST=22.188.9.144"
set "DB_PORT=3306"
set "DB_USER=root"
set "DB_PASSWORD=Star002!"
set "DB_NAME=chat_db"
set "REDIS_ENABLE=false"
set "JWT_SECRET=go-chat-server-prod-jwt-secret-change-me"
set "UPLOAD_DIR=D:/data/chat-server/uploads"
set "SERVER_PORT=8094"
set "DEPLOY_DIR=D:\app\chat-server"
:: ========================================================

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
if not exist "client-chat-tauri\package.json" (
    echo ❌ 未找到 client-chat-tauri\package.json！
    pause
    exit /b 1
)
if not exist "go-chat-server\main.go" (
    echo ❌ 未找到 go-chat-server\main.go！
    pause
    exit /b 1
)
if not exist "go-chat-server\config\config.yaml" (
    echo ❌ 未找到 go-chat-server\config\config.yaml！
    pause
    exit /b 1
)
echo ✅ 所有源文件就绪
echo.
echo 📌 内网部署参数:
echo    Server:  :%SERVER_PORT%
echo    DB:      %DB_HOST%:%DB_PORT%/%DB_NAME%
echo    Redis:   %REDIS_ENABLE%
echo    Upload:  %UPLOAD_DIR%
echo    Deploy:  %DEPLOY_DIR%
echo.

:: ========== Step 2: 构建前端 dist ==========
echo [2/7] ⚡ 构建 Vue 前端（同源自适应，无需硬编码 IP）...

cd /d "%PROJECT_ROOT%\client-chat-tauri"

echo.
echo ==================================================
echo   Vite 正在编译（首次约 30-60 秒）...
echo   mode: web-spa → 继承 .env 基线，前后端同源
echo ==================================================
echo.

call npm run build:web-spa
set BUILD_RESULT=%errorlevel%

if %BUILD_RESULT% neq 0 (
    echo.
    echo ❌ 前端构建失败！
    pause
    exit /b 1
)
echo.
echo ✅ 前端构建完成
echo.

:: ========== Step 3: 复制 dist 到 Go 后端 ==========
echo [3/7] 📦 复制前端产物到 Go 后端...

set "DIST_SRC=%PROJECT_ROOT%\client-chat-tauri\dist"
set "DIST_DST=%PROJECT_ROOT%\go-chat-server\frontend\dist"

if not exist "%DIST_SRC%" (
    echo ❌ 未找到构建产物 %DIST_SRC%
    pause
    exit /b 1
)

:: 清空目标目录并重新复制
if exist "%DIST_DST%" (
    rmdir /s /q "%DIST_DST%"
)
mkdir "%DIST_DST%" >nul 2>&1

xcopy /e /y /q "%DIST_SRC%\*" "%DIST_DST%\" >nul
echo   已复制: %DIST_SRC% → %DIST_DST%
echo.

:: ========== Step 4: 编译 Go 后端 ==========
echo [4/7] 🐹 编译 Go 后端（内嵌前端）...

cd /d "%PROJECT_ROOT%\go-chat-server"

if not exist "main.go" (
    echo ❌ 未找到 go-chat-server\main.go！
    pause
    exit /b 1
)

echo   目标: Windows amd64
echo   输出: go-chat-server.exe
echo.

set "GO_OUT=go-chat-server.exe"
go build -ldflags "-s -w" -o "%GO_OUT%" .
if %errorlevel% neq 0 (
    echo.
    echo ❌ Go 编译失败！
    pause
    exit /b 1
)
echo ✅ Go 编译完成
echo.

:: ========== Step 5: 准备输出目录 + 复制 Go 二进制 + 展开 config.yaml ==========
echo [5/7] 📦 准备输出目录...

cd /d "%PROJECT_ROOT%"

set "OUT_DIR=%PROJECT_ROOT%\bin\chat-server-lan"

:: 清空并重建输出目录
if exist "%OUT_DIR%" rmdir /s /q "%OUT_DIR%"
mkdir "%OUT_DIR%" >nul 2>&1
mkdir "%OUT_DIR%\config" >nul 2>&1

:: 复制 Go 二进制
copy /y "%PROJECT_ROOT%\go-chat-server\%GO_OUT%" "%OUT_DIR%\%GO_OUT%" >nul
echo   复制 %GO_OUT% → %OUT_DIR%\

:: 构建时展开 config.yaml（${VAR:default} → 内网实际值）
:: 必须在 go-chat-server 目录下执行，--expand-config 会查找 ./config/config.yaml 模板
echo   展开 config.yaml（注入内网参数）→ %OUT_DIR%\config\config.yaml
cd /d "%PROJECT_ROOT%\go-chat-server"
"%PROJECT_ROOT%\go-chat-server\%GO_OUT%" --expand-config "%OUT_DIR%\config\config.yaml"
if %errorlevel% neq 0 (
    cd /d "%PROJECT_ROOT%"
    echo ❌ 配置文件展开失败！
    pause
    exit /b 1
)
cd /d "%PROJECT_ROOT%"
echo   ✅ 配置文件已展开
echo.

:: ========== Step 6: 生成 WinSW 服务定义 + 启停辅助脚本 ==========
echo [6/7] ⚙️  生成 WinSW 服务定义及启停脚本...
echo   部署目录: %DEPLOY_DIR%

:: ---- ChatServer.xml (WinSW 服务定义) ----
(
echo ^<service^>
echo   ^<id^>ChatServer^</id^>
echo   ^<name^>Go Chat Server Backend^</name^>
echo   ^<description^>Tauri 聊天软件的 Go 原生后端常驻服务^</description^>
echo   ^<executable^>%DEPLOY_DIR%\go-chat-server.exe^</executable^>
echo   ^<workingdirectory^>%DEPLOY_DIR%^</workingdirectory^>
echo   ^<logmode^>rotate^</logmode^>
echo   ^<startmode^>Automatic^</startmode^>
echo ^</service^>
) > "%OUT_DIR%\ChatServer.xml"

echo   ✅ ChatServer.xml 已生成

:: ---- startServer.bat (安装 + 启动服务) ----
(
echo @echo off
echo chcp 65001 ^>nul 2^>^&1
echo echo ==========================================
echo echo   启动 Chat Server 服务
echo echo   工作目录: %DEPLOY_DIR%
echo echo ==========================================
echo echo.
echo.
echo :: 切到部署目录
echo cd /d "%DEPLOY_DIR%"
echo.
echo :: 需要以管理员身份运行
echo net session ^>nul 2^>^&1
echo if ^%%errorlevel^%% neq 0 ^(
echo     echo ❌ 请以管理员身份运行此脚本！
echo     pause
echo     exit /b 1
echo ^)
echo.
echo echo [1/3] 安装服务...
echo ChatServer.exe install
echo if ^%%errorlevel^%% neq 0 ^(
echo     echo 提示: 服务可能已安装，尝试直接启动...
echo ^)
echo.
echo echo [2/3] 启动服务...
echo ChatServer.exe start
echo if ^%%errorlevel^%% neq 0 ^(
echo     echo ❌ 服务启动失败！
echo     pause
echo     exit /b 1
echo ^)
echo.
echo echo [3/3] 校验服务状态...
echo ChatServer.exe status
echo.
echo echo ==========================================
echo echo   ✅ Chat Server 服务已启动
) > "%OUT_DIR%\startServer.bat"
>>"%OUT_DIR%\startServer.bat" echo echo   访问: http://localhost:%SERVER_PORT%/api/ping
(
echo echo ==========================================
echo pause
) >> "%OUT_DIR%\startServer.bat"

:: ---- stopServer.bat (停止 + 卸载服务) ----
(
echo @echo off
echo chcp 65001 ^>nul 2^>^&1
echo echo ==========================================
echo echo   停止 Chat Server 服务
echo echo   工作目录: %DEPLOY_DIR%
echo echo ==========================================
echo echo.
echo.
echo :: 切到部署目录
echo cd /d "%DEPLOY_DIR%"
echo.
echo net session ^>nul 2^>^&1
echo if ^%%errorlevel^%% neq 0 ^(
echo     echo ❌ 请以管理员身份运行此脚本！
echo     pause
echo     exit /b 1
echo ^)
echo.
echo echo 正在停止服务...
echo ChatServer.exe stop
echo echo.
echo echo 正在卸载服务...
echo ChatServer.exe uninstall
echo echo.
echo echo ✅ 服务已停止并卸载
echo pause
) > "%OUT_DIR%\stopServer.bat"

echo   ✅ startServer.bat / stopServer.bat 已生成
echo.

:: ========== Step 7: 复制 WinSW 可执行文件 ==========
echo [7/7] ⚙️  复制 WinSW 可执行文件...
set "WINSW_SRC=%PROJECT_ROOT%\deploy\WinSW-x64.exe"
set "WINSW_DST=%OUT_DIR%\ChatServer.exe"

if exist "%WINSW_SRC%" (
    copy /y "%WINSW_SRC%" "%WINSW_DST%" >nul
    echo   deploy\WinSW-x64.exe → %OUT_DIR%\ChatServer.exe
    echo   ✅ WinSW 已自动部署
) else (
    echo   ⚠️  未找到 deploy\WinSW-x64.exe，请从以下地址下载后放入 deploy 目录:
    echo      https://github.com/winsw/winsw/releases
)
echo.

:: ========== 输出完成信息 ==========
echo ==================================================
echo   🏁  构建完成！内网 Web 全合一版本
echo ==================================================
echo.
echo   📌 构建产物目录: %OUT_DIR%\
echo         ├── %GO_OUT%
echo         ├── config\config.yaml   ^(内嵌内网数据库参数^)
echo         ├── ChatServer.exe       ^(WinSW 可执行文件^)
echo         ├── ChatServer.xml       ^(WinSW 服务定义^)
echo         ├── startServer.bat      ^(安装 + 启动^)
echo         └── stopServer.bat       ^(停止 + 卸载^)
echo.
echo   📌 部署步骤:
echo       1. 将 %OUT_DIR%\ 下所有文件复制到 %DEPLOY_DIR%\
echo       2. 以管理员身份运行 %DEPLOY_DIR%\startServer.bat
echo       3. 浏览器验证: http://localhost:%SERVER_PORT%/api/ping
echo.
echo   💡 修改内网参数: 编辑本 bat 头部 set 变量，重新构建即可
echo   💡 go-chat-server.exe 同时提供 Go API + Vue 前端 SPA
echo ==================================================
echo.

cd /d "%PROJECT_ROOT%"
pause
exit /b 0
