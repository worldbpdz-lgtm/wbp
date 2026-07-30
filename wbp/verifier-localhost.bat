@echo off
setlocal enabledelayedexpansion
title WBP - Pourquoi localhost ne s'ouvre pas ?
cd /d "%~dp0"
echo ================================================================
echo   TEST D'ACCES A LOCALHOST
echo.
echo   IMPORTANT : laissez "npm run dev" tourner dans SA fenetre,
echo   et lancez ce test dans CETTE fenetre-ci, en meme temps.
echo ================================================================
echo.

echo [1/4] Qui ecoute sur le port 3000 ?
echo ----------------------------------------------------------------
netstat -ano | findstr /R /C:":3000 .*LISTENING" > "%TEMP%\wbp_listen.txt" 2>nul
for /f %%A in ('type "%TEMP%\wbp_listen.txt" ^| find /c /v ""') do set NLISTEN=%%A
if "!NLISTEN!"=="0" (
  echo   [X] PERSONNE n'ecoute sur le port 3000.
  echo.
  echo       Le serveur n'est donc pas demarre, OU il s'est arrete,
  echo       OU il ecoute sur un autre port.
  echo       -^> Verifiez la fenetre "npm run dev" : elle doit rester
  echo          ouverte et afficher "Ready in ... ms".
  goto :suite
) else (
  type "%TEMP%\wbp_listen.txt"
  echo   [OK] Un processus ecoute bien sur le port 3000.
)

:suite
echo.
echo [2/4] Est-ce que Windows lui-meme arrive a ouvrir la page ?
echo ----------------------------------------------------------------
echo   (patientez : la premiere compilation peut prendre 30 a 60 s)
echo.

call :essai "http://127.0.0.1:3000/"
set R1=!ERRLEV!
call :essai "http://localhost:3000/"
set R2=!ERRLEV!

echo.
echo [3/4] Verdict
echo ----------------------------------------------------------------
if "!R1!"=="0" if "!R2!"=="0" (
  echo   Les DEUX adresses repondent : le serveur va bien.
  echo   Le probleme vient donc du NAVIGATEUR.
  echo     - essayez une fenetre de navigation privee
  echo     - desactivez les extensions ^(bloqueur de pub, VPN, antivirus web^)
  echo     - Parametres Windows -^> Reseau -^> Proxy : tout doit etre DESACTIVE
  goto :fin
)
if "!R1!"=="0" if not "!R2!"=="0" (
  echo   127.0.0.1 repond mais PAS localhost.
  echo   C'est le probleme IPv6 classique de Windows : "localhost" est
  echo   resolu en ::1 alors que le serveur ecoute en IPv4.
  echo.
  echo   SOLUTION IMMEDIATE : utilisez cette adresse dans le navigateur :
  echo       http://127.0.0.1:3000
  echo.
  echo   SOLUTION DEFINITIVE : lancez le serveur avec
  echo       npm run dev:ip
  goto :fin
)
if not "!R1!"=="0" (
  echo   Windows non plus n'arrive pas a joindre le serveur.
  echo   Ce n'est PAS un probleme de navigateur. Causes probables :
  echo     1. le serveur n'est pas demarre dans l'autre fenetre
  echo     2. le pare-feu / l'antivirus bloque Node.js
  echo        -^> Pare-feu Windows -^> Autoriser une application -^> Node.js
  echo     3. un proxy d'entreprise intercepte le trafic local
  echo     4. le port 3000 est pris par un autre logiciel
  echo        -^> essayez : npm run dev -- -p 3005
  goto :fin
)

:fin
echo.
echo [4/4] Adresse reseau ^(depuis un telephone sur le meme WiFi^)
echo ----------------------------------------------------------------
for /f "tokens=2 delims=:" %%I in ('ipconfig ^| findstr /C:"IPv4"') do (
  for /f "tokens=* delims= " %%J in ("%%I") do echo   http://%%J:3000
)
echo.
echo ================================================================
echo  Copiez TOUT ce texte et envoyez-le moi si le probleme persiste.
echo ================================================================
echo.
pause
exit /b

:essai
set "URL=%~1"
echo   Test de %URL%
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r = Invoke-WebRequest -Uri '%URL%' -TimeoutSec 90 -UseBasicParsing -ErrorAction Stop; Write-Host ('     [OK] HTTP ' + $r.StatusCode + ' - ' + $r.RawContentLength + ' octets recus') -ForegroundColor Green; exit 0 } catch { Write-Host ('     [X] ECHEC : ' + $_.Exception.Message) -ForegroundColor Red; exit 1 }"
set ERRLEV=%ERRORLEVEL%
exit /b
