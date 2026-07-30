@echo off
title WBP - Diagnostic
cd /d "%~dp0"
echo ================================================================
echo   DIAGNOSTIC World Business Plus
echo   Verifie : fichiers, .env.local, connexion Supabase,
echo             migration, stockage des images, catalogue.
echo   Ne modifie rien.
echo ================================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js n'est pas installe. Telechargez la version LTS sur https://nodejs.org
  pause
  exit /b 1
)

node scripts\diagnose.mjs
echo.
pause
