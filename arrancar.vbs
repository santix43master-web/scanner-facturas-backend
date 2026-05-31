Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d C:\Users\Family1\Desktop\app-facturas && uv run uvicorn main:app --host 0.0.0.0 --port 8080", 0, False