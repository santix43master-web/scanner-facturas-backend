Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d C:\Users\Santiago\Desktop\Todo de Santiago\app-facturas && .venv\Scripts\uvicorn main:app --host 0.0.0.0 --port 8080", 0, False