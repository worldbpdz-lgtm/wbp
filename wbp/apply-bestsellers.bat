@echo off
title WBP - Meilleures ventes
cd /d "%~dp0"
echo ================================================================
echo   Migration : Meilleures ventes
echo   Cree la table "best_sellers" pour choisir les produits
echo   affiches dans "Meilleures ventes" sur la page d'accueil.
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

node scripts\apply-bestsellers.mjs
if errorlevel 1 (
  echo.
  echo [X] La migration a echoue. Verifiez DATABASE_URL dans .env.local
  pause
  exit /b 1
)

echo.
echo ----------------------------------------------------------------
echo  Termine ! Ouvrez /admin/best-sellers pour choisir les produits
echo  de la section "Meilleures ventes" de la page d'accueil.
echo ----------------------------------------------------------------
pause
