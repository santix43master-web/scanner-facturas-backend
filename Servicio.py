import win32serviceutil
import win32service
import win32event
import servicemanager
import socket
import sys
import os
import subprocess

class ServicioBTI(win32serviceutil.ServiceFramework):
    _svc_name_ = "ServicioBTI"
    _svc_display_name_ = "Servicio BTI - Backend Facturas"
    _svc_description_ = "Arranca de fondo el main.py de FastAPI para conectar la app móvil."

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        socket.setdefaulttimeout(60)
        self.proceso = None

    def SvcStop(self):
        # Le avisamos a Windows que se está apagando
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self.hWaitStop)
        # Matamos el proceso de uvicorn para que no quede flotando
        if self.proceso:
            self.proceso.terminate()

    def SvcDoRun(self):
        # 📂 Tu carpeta actual en el escritorio
        ruta_proyecto = r"C:\Users\Family1\Desktop\app-facturas"
        os.chdir(ruta_proyecto)
        
        # 🚀 Apuntamos directo al uvicorn de tu entorno virtual (.venv)
        comando = [
            os.path.join(ruta_proyecto, ".venv", "Scripts", "uvicorn.exe"),
            "main:app",
            "--host", "0.0.0.0",
            "--port", "8080",
            "--http", "h11"
        ]
        
        # 🔥 EL TRUCO: Le avisamos a Windows que ya arrancó ANTES de lanzar uvicorn
        # Así el sistema operativo no se impacienta ni tira error de tiempo
        self.ReportServiceStatus(win32service.SERVICE_RUNNING)
        
        # Lanzamos el backend en segundo plano
        self.proceso = subprocess.Popen(comando)
        
        # El servicio se queda vivo esperando la orden de detenerse
        win32event.WaitForSingleObject(self.hWaitStop, win32event.INFINITE)

if __name__ == '__main__':
    if len(sys.argv) == 1:
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingleService(ServicioBTI)
        servicemanager.StartServiceCtrlDispatcher()
    else:
        win32serviceutil.HandleCommandLine(ServicioBTI)