@echo off
setlocal
cd /d "%~dp0"
title Norma - anteprima locale

REM ============================================================
REM  Doppio click qui, e basta.
REM
REM  Serve un server perche' la pagina carica l'indice con fetch e
REM  usa i moduli JavaScript: aprendo il file con un doppio click
REM  il protocollo e' file:// e il browser blocca entrambi. E' una
REM  regola di sicurezza, non un difetto.
REM
REM  Questa cartella e' autonoma: non dipende da nessun'altra.
REM  Quello che vedi qui e' esattamente quello che finira' online.
REM
REM  Per fermare il server: CTRL+C, oppure chiudi la finestra.
REM ============================================================

echo.
echo   Norma - anteprima locale
echo   ------------------------

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [X] Python non trovato nel PATH.
  echo       Serve solo per il server locale.
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0indice.json" (
  echo.
  echo   [X] Manca indice.json. Costruiscilo con:
  echo         python estrai.py
  echo         node indicizza.mjs
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0testi.json" (
  echo.
  echo   [X] Manca testi.json. Lo scrive l'indicizzatore:
  echo         node indicizza.mjs
  echo.
  pause
  exit /b 1
)

echo   apro il browser su http://localhost:8180/
start "" http://localhost:8180/
echo.
echo   CTRL+C per fermare.
echo.
python -m http.server 8180
