@echo off
title WBP - Produits mis en avant (featured)
cd /d "%~dp0"
echo ================================================================
echo   Migration : produits mis en avant
echo   Ajoute la colonne "featured" a la table products
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

node scripts\apply-featured.mjs
if errorlevel 1 (
  echo.
  echo [X] La migration a echoue. Verifiez DATABASE_URL dans .env.local
  pause
  exit /b 1
)

echo.
echo ----------------------------------------------------------------
echo  Termine ! Dans /admin/products, cliquez l'etoile d'un produit
echo  pour le mettre en avant : il apparaitra en premier dans le
echo  catalogue, dans "Tous les produits" comme dans les filtres.
echo ----------------------------------------------------------------
pause
