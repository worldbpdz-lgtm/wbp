@echo off
title WBP - Demarrage du site en local
cd /d "%~dp0"
echo ================================================================
echo   World Business Plus - demarrage local
echo ----------------------------------------------------------------
echo   Ecoute forcee sur 127.0.0.1 : evite le probleme Windows ou
echo   "localhost" pointe vers IPv6 (::1) et le navigateur n'arrive
echo   pas a se connecter.
echo ================================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js n'est pas installe. Version LTS sur https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Premiere fois : installation des librairies...
  call npm install
  if errorlevel 1 ( echo [X] Installation echouee. & pause & exit /b 1 )
)

REM Un cache .next corrompu empeche parfois toute compilation.
if "%1"=="clean" (
  echo Nettoyage du cache .next...
  if exist .next rmdir /s /q .next
)

REM Le port 3000 est-il deja pris ?
set PORT=3000
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo [!] Le port 3000 est deja utilise -- on bascule sur 3005.
  set PORT=3005
)

echo.
echo   Le navigateur va s'ouvrir tout seul dans quelques secondes.
echo   La PREMIERE page met 30 a 60 s a compiler : c'est normal.
echo   Laissez cette fenetre OUVERTE tant que vous utilisez le site.
echo.

REM Ouvre le navigateur en differe, pendant que le serveur demarre.
start "" cmd /c "timeout /t 6 /nobreak >nul & start http://127.0.0.1:%PORT%"

npx next dev -H 127.0.0.1 -p %PORT%

echo.
echo Le serveur s'est arrete.
pause
