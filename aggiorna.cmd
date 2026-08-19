@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Norma - pubblica gli aggiornamenti

REM ============================================================
REM  Manda online le modifiche: aggiunge, registra, spinge.
REM
REM  Esiste per un motivo pratico: i comandi git vanno eseguiti
REM  DENTRO questa cartella, e lanciandoli da altrove rispondono
REM  "not a git repository". Questo script si sposta da solo —
REM  %~dp0 e' la cartella in cui il file si trova.
REM
REM  Doppio click. Chiede una descrizione e fa il resto.
REM ============================================================

echo.
echo   Norma - pubblica gli aggiornamenti
echo   ----------------------------------

where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [X] Git non trovato nel PATH.
  echo.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [X] Questa cartella non e' un repository git.
  echo.
  pause
  exit /b 1
)

echo.
echo   Cosa e' cambiato:
echo.
git status --short
echo.

REM  Se non c'e' niente da inviare, si ferma qui invece di
REM  fabbricare un commit vuoto.
git diff --quiet
set MODIFICATI=%errorlevel%
git diff --cached --quiet
set INDICIZZATI=%errorlevel%
for /f %%A in ('git ls-files --others --exclude-standard ^| find /c /v ""') do set NUOVI=%%A

if "%MODIFICATI%"=="0" if "%INDICIZZATI%"=="0" if "%NUOVI%"=="0" (
  echo   Niente da pubblicare: e' tutto gia' online.
  echo.
  pause
  exit /b 0
)

set "MESSAGGIO="
set /p MESSAGGIO=  Descrivi la modifica (invio per annullare):
if "!MESSAGGIO!"=="" (
  echo.
  echo   Annullato. Niente e' stato inviato.
  echo.
  pause
  exit /b 0
)

echo.
echo   [1/3] aggiungo
git add -A
if errorlevel 1 goto errore

echo   [2/3] registro
git commit -m "!MESSAGGIO!"
if errorlevel 1 goto errore

echo   [3/3] invio a GitHub
git push
if errorlevel 1 goto errore

echo.
echo   Fatto. Fra una ventina di secondi e' online:
echo   https://norma.17labs.it/
echo.
pause
exit /b 0

:errore
echo.
echo   [X] Qualcosa e' andato storto: leggi il messaggio qui sopra.
echo.
pause
exit /b 1
