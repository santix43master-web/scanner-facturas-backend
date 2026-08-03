@echo off
title Facturas R21 - Backend
cd /d "C:\Users\Santiago\Desktop\Todo de Santiago\app-facturas"
set CARPETA_COMPARTIDA=\\192.168.100.16\Users\Public\JSON
call .venv\Scripts\activate.bat
python -m uvicorn main:app --host 0.0.0.0 --port 10000
