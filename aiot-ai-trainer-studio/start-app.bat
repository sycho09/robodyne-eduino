@echo off
chcp 65001 >nul
title Eduino AI Lab
cd /d "%~dp0"
echo ============================================================
echo   Eduino AI Lab 을 시작합니다
echo   - 잠시 후 브라우저가 자동으로 열립니다
echo   - 사용을 마치면 "서버" 창을 닫으면 종료됩니다
echo ============================================================
start "Eduino AI Lab Server" cmd /k "title Eduino AI Lab Server (닫으면 종료) & npx --yes http-server . -p 8000 -c-1"
timeout /t 3 >nul
start "" "http://localhost:8000/index.html"
exit
