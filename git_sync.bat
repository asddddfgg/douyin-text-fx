@echo off
chcp 65001 >nul
title douyin-text-fx - 高精度 Git 交互工具箱
color 0A

:MENU
cls
echo =========================================================
echo      douyin-text-fx 项目 - 高精度 Git 交互控制台
echo =========================================================
echo.
echo   [1] 📝 规范提交：查看变动 - 填写说明 - 确认后推送
echo   [2] 🚀 强制覆盖：以本地代码为准，强行覆写 GitHub
echo   [3] 🔍 改动明细：详细查看当前修改的文件列表
echo   [4] ↩️ 撤销提交：撤销上一次 commit（保留本地代码）
echo   [5] ❌ 退出程序
echo.
echo =========================================================
set /p menu_choice=请选择操作编号 (1-5): 

if "%menu_choice%"=="1" goto PUSH_NORMAL
if "%menu_choice%"=="2" goto PUSH_FORCE
if "%menu_choice%"=="3" goto SHOW_STATUS
if "%menu_choice%"=="4" goto UNDO_COMMIT
if "%menu_choice%"=="5" goto END

echo.
echo ❌ 输入无效，请输入数字 1 到 5！
timeout /t 2 >nul
goto MENU

:: =========================================================
:: 1. 规范提交与推送（细致步进确认）
:: =========================================================
:PUSH_NORMAL
cls
echo =========================================================
echo   [步骤 1/4] 查看当前本地修改的文件列表
echo =========================================================
echo.
git status -s
echo.
echo ---------------------------------------------------------
set /p confirm_step1=确认以上修改并继续提交？(输入 Y 确认，输入 N 返回主菜单): 
if /i not "%confirm_step1%"=="Y" (
    echo 操作已取消。
    timeout /t 1 >nul
    goto MENU
)

:INPUT_MSG
cls
echo =========================================================
echo   [步骤 2/4] 填写本次提交说明 (Commit Message)
echo =========================================================
echo.
set /p commit_msg=请输入修改说明（直接回车默认使用: update）: 
if "%commit_msg%"==" " set commit_msg=update
if "%commit_msg%"=="" set commit_msg=update

cls
echo =========================================================
echo   [步骤 3/4] 提交信息预判与最终确认
echo =========================================================
echo.
echo   当前分支: main
echo   提交说明: "%commit_msg%"
echo.
echo ---------------------------------------------------------
echo   [1] 确认无误，立即提交并推送到 GitHub
echo   [2] 重新填写提交说明
echo   [3] 取消并返回主菜单
echo ---------------------------------------------------------
set /p confirm_step2=请选择 (1-3): 

if "%confirm_step2%"=="2" goto INPUT_MSG
if "%confirm_step2%"=="3" goto MENU
if not "%confirm_step2%"=="1" (
    echo 输入错误，请重新选择。
    timeout /t 1 >nul
    goto INPUT_MSG
)

cls
echo =========================================================
echo   [步骤 4/4] 正在执行 Git 同步指令...
echo =========================================================
echo.
echo [1/3] 暂存本地改动 (git add .)...
git add .

echo [2/3] 生成本地提交 (git commit)...
git commit -m "%commit_msg%"
if errorlevel 1 (
    echo.
    echo ⚠️ 提示：本地没有检测到代码改动，无需提交。
    pause
    goto MENU
)

echo [3/3] 推送到远程仓库 (git push origin main)...
git push origin main
if errorlevel 1 goto ERROR_HANDLE

goto SUCCESS_NOTICE

:: =========================================================
:: 2. 强制覆盖远程（高风险二次二次校验）
:: =========================================================
:PUSH_FORCE
cls
color 0C
echo =========================================================
echo   ⚠️ 警告：强制覆盖远程仓库 (force push)
echo =========================================================
echo.
echo   该操作将用你当前的本地代码，强制冲掉 GitHub 上的远程代码！
echo   请确认你本地的代码是完全满意、可运行的最终版本。
echo.
echo ---------------------------------------------------------
set /p force_confirm1=确定要继续吗？(必须输入大写 Y 确认，输入其他返回): 
if not "%force_confirm1%"=="Y" (
    color 0A
    echo 已取消危险操作。
    timeout /t 1 >nul
    goto MENU
)

cls
echo =========================================================
echo   请输入强制提交的说明
echo =========================================================
echo.
set /p force_msg=请输入说明（直接回车默认: force update）: 
if "%force_msg%"==" " set force_msg=force update
if "%force_msg%"=="" set force_msg=force update

echo.
echo 正在执行强推操作...
git add .
git commit -m "%force_msg%"
git push origin main --force
if errorlevel 1 (
    color 0A
    goto ERROR_HANDLE
)

color 0A
goto SUCCESS_NOTICE

:: =========================================================
:: 3. 查看详细修改状态
:: =========================================================
:SHOW_STATUS
cls
echo =========================================================
echo   当前仓库详细改动状态 (git status)
echo =========================================================
echo.
git status
echo.
echo ---------------------------------------------------------
pause
goto MENU

:: =========================================================
:: 4. 撤销上一次本地 commit
:: =========================================================
:UNDO_COMMIT
cls
echo =========================================================
echo   撤销上一次本地提交 (git reset --soft HEAD~1)
echo =========================================================
echo.
echo   说明：此操作仅撤销提交记录，你修改的所有文件和代码
echo         会百分之百完整保留在本地！
echo.
set /p undo_confirm=确定要撤销上一次提交吗？(输入 Y 确认，输入其他取消): 
if /i not "%undo_confirm%"=="Y" (
    echo 已取消操作。
    timeout /t 1 >nul
    goto MENU
)

echo.
echo 正在撤销...
git reset --soft HEAD~1
echo.
echo ✅ 撤销成功！修改的文件已重新回到暂存状态。
echo.
pause
goto MENU

:: =========================================================
:: 错误排查引导
:: =========================================================
:ERROR_HANDLE
echo.
echo =========================================================
echo ❌ 推送过程出现异常！
echo =========================================================
echo 排查建议：
echo   1. 请检查网络或代理软件（GitHub 连接超时）。
echo   2. 请确认远程分支名是否为 main。
echo   3. 如果无改动，无需重复推送。
echo.
pause
goto MENU

:: =========================================================
:: 成功完成提示
:: =========================================================
:SUCCESS_NOTICE
echo.
echo =========================================================
echo 🎉 同步成功！Cloudflare Pages 将在 10 秒内自动触发部署。
echo =========================================================
echo.
pause
goto MENU

:END
exit