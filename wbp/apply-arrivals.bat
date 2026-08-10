@echo off
title WBP - Nouveautes (nouveaux arrivages)
cd /d "%~dp0"
echo ================================================================
echo   Migration : Nouveautes
echo   Cree la table "new_arrivals" pour choisir les produits
echo   affiches dans "Nouveaux arrivages" sur la page d'accueil.
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

node scripts\apply-arrivals.mjs
if errorlevel 1 (
  echo.
  echo [X] La migration a echoue. Verifiez DATABASE_URL dans .env.local
  pause
  exit /b 1
)

echo.
echo ----------------------------------------------------------------
echo  Termine ! Ouvrez /admin/arrivals pour choisir les produits
echo  de la section "Nouveaux arrivages" de la page d'accueil.
echo ----------------------------------------------------------------
pause
