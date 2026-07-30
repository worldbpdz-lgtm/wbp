@echo off
title WBP + Central Network - base de donnees partagee
cd /d "%~dp0"
echo ================================================================
echo   Migration multi-sites : WBP + Central Network
echo   Une seule base de donnees, catalogue partage entre les 2 sites
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

node scripts\apply-multisite.mjs
if errorlevel 1 (
  echo.
  echo [X] La migration a echoue. Verifiez DATABASE_URL dans .env.local
  pause
  exit /b 1
)

echo.
set "OTHER=..\..\centralnetwork\central-network-app"
if exist "%OTHER%\public\products" (
  echo Synchronisation des photos produits entre les deux sites...
  robocopy "public\products" "%OTHER%\public\products" /E /XO /XC /XN /NFL /NDL /NJH /NJS >nul
  robocopy "%OTHER%\public\products" "public\products" /E /XO /XC /XN /NFL /NDL /NJH /NJS >nul
  echo Photos synchronisees.
) else (
  echo [i] Dossier Central Network introuvable a %OTHER% - photos non synchronisees.
)

echo.
echo ----------------------------------------------------------------
echo  Termine ! Les deux sites utilisent desormais la MEME base :
echo  ajouter ou modifier un produit dans /admin de l'un OU l'autre
echo  site met a jour les deux sites web.
echo ----------------------------------------------------------------
pause
