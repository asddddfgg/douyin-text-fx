@echo off
chcp 65001 >nul
echo ===========================================
echo   抖音特效生成器 - Git 一键自动同步工具
echo ===========================================
echo.

:: 提示用户输入提交说明
set /p commit_msg=请输入本次修改说明，结束按回车（直接回车默认: update）: 

:: 如果用户直接回车未输入，给一个默认说明
if "%commit_msg%"=="" set commit_msg=update

echo.
echo [1/3] 正在添加所有修改文件 (git add)...
git add .

echo [2/3] 正在提交更改 (git commit)...
git commit -m "%commit_msg%"

echo [3/3] 正在推送到 GitHub (git push)...
git push origin main

echo.
echo ===========================================
echo   同步成功！Cloudflare Pages 将在 10 秒内自动更新。
echo ===========================================
echo.
pause