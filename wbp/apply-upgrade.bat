@echo off
title WBP - Mise a niveau (images, vitrine, pop-up, assistant IA)
cd /d "%~dp0"
echo ================================================================
echo   MISE A NIVEAU World Business Plus
echo.
echo   - Upload d'images : produits, marques, categories
echo   - Vitrine : choisir categorie, marque et produits en premier
echo   - Pop-up newsletter a l'ouverture du site
echo   - Assistant IA branchable depuis /admin/ai
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

node scripts\apply-upgrade.mjs
if errorlevel 1 (
  echo.
  echo [X] La migration a echoue. Verifiez DATABASE_URL dans .env.local
  echo     Vous pouvez aussi coller supabase\upgrade.sql dans
  echo     Supabase - SQL Editor - Run.
  pause
  exit /b 1
)

echo.
echo ----------------------------------------------------------------
echo  Termine ! Relancez le site (start-dev.bat) puis ouvrez /admin :
echo    - Marques / Categories : glissez un logo ou une image
echo    - Produits : photo principale + galerie
echo    - Vitrine : choisissez les produits affiches en premier
echo    - Assistant IA : collez l'URL et la cle de votre plateforme
echo ----------------------------------------------------------------
pause
