@echo off
title WBP - Journal d'activite
cd /d "%~dp0"
echo ================================================================
echo   Migration : Journal d'activite
echo   Cree la table "admin_activity" : qui a fait quoi, quel jour,
echo   a quelle heure. Alimente l'onglet "Activite" de l'app mobile.
echo ================================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js n'est pas installe. Telechargez la version LTS sur https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Premiere fois : installation des librairies...
  call npm install
  if errorlevel 1 (
    echo [X] L'installation a echoue. Verifiez votre connexion internet.
    pause
    exit /b 1
  )
)

node scripts\apply-activity.mjs
if errorlevel 1 (
  echo.
  echo [X] La migration a echoue. Verifiez DATABASE_URL dans .env.local
  pause
  exit /b 1
)

echo.
echo ----------------------------------------------------------------
echo  Termine ! Le journal d'activite est actif.
echo  Il s'affiche dans l'app mobile WBP, onglet "Activite".
echo ----------------------------------------------------------------
pause
