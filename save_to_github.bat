
@echo off
setlocal
cd /d "%~dp0"

title AI LEDGER - GitHub Sync

echo ========================================
echo       AI LEDGER - GITHUB SYNC
echo ========================================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git repository not found.
    pause
    exit /b 1
)

echo Current Git status:
git status --short
echo.

set /p "commitmsg=Enter commit message: "
if not defined commitmsg set "commitmsg=Update AI Ledger"

echo.
echo Review the changes above before continuing.
set /p "confirm=Stage, commit and push these changes? (Y/N): "

if /i not "%confirm%"=="Y" (
    echo Cancelled. No changes were committed or pushed.
    pause
    exit /b 0
)

echo.
git add -A
if errorlevel 1 goto error

git diff --cached --quiet
if not errorlevel 1 (
    echo No new changes to commit.
    git status
    pause
    exit /b 0
)

git commit -m "%commitmsg%"
if errorlevel 1 goto error

git push
if errorlevel 1 goto error

echo.
echo SUCCESS: Changes pushed to GitHub!
echo https://github.com/saurabhmishra9090/AI-Ledger
pause
exit /b 0

:error
echo.
echo ERROR: Git operation failed.
echo Read the message above and resolve the issue.
pause
exit /b 1
