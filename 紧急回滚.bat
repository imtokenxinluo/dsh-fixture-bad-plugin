@echo off
chcp 65001 >nul
echo.
echo ============================================
echo  紧急回滚：把测试夹具从 DSH profile 卸下
echo ============================================
echo.
node "%~dp0scripts\profile-link.mjs" --remove
echo.
echo 完成后请重启 DSH。
echo.
pause
