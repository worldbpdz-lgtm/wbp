@echo off
title WBP - Fiches techniques (PDF)
cd /d "%~dp0"
echo ================================================================
echo   Migration : Fiches techniques
echo   Ajoute la colonne "docs" aux produits : les PDF televerses
echo   depuis /admin et telechargeables par le client sur le site.
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

node scripts\apply-documents.mjs
if errorlevel 1 (
  echo.
  echo [X] La migration a echoue. Verifiez DATABASE_URL dans .env.local
  pause
  exit /b 1
)

echo.
echo ----------------------------------------------------------------
echo  Termine ! Ouvrez /admin/products, choisissez un produit, et
echo  televersez la fiche technique dans le bloc "Documents".
echo ----------------------------------------------------------------
pause
