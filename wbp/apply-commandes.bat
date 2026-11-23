@echo off
title WBP - Commandes, clients et notifications
cd /d "%~dp0"
echo ================================================================
echo   Migration : Commandes, clients et notifications
echo   Cree les tables "orders", "customers", "notifications" et
echo   "push_subscriptions", numerote les devis existants et cree
echo   les fiches clients a partir des devis et messages deja recus.
echo   Sans risque : rien n'est supprime, re-executable.
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

node scripts\apply-commandes.mjs
if errorlevel 1 (
  echo.
  echo [X] La migration a echoue. Verifiez DATABASE_URL dans .env.local
  echo     ou collez supabase\commandes-notifications.sql dans Supabase, SQL Editor, Run.
  pause
  exit /b 1
)

echo.
echo ----------------------------------------------------------------
echo  Termine ! Commandes, fiches clients et notifications sont actifs.
echo ----------------------------------------------------------------
pause
