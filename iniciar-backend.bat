@echo off
cd /d "C:\Users\Santiago\Desktop\Todo de Santiago\app-facturas"
.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8080
