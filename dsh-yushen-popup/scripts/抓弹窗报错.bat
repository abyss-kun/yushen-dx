@echo off
chcp 65001 >nul
title Popup Console Capture
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\DSH\大小鱼\鱼神常驻\.tmp\capture-console.ps1"
pause
