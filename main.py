import os
import json
import base64
from datetime import datetime
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import interpretacion 

# Inicializar aplicación
app = FastAPI()

# Configuración CORS para permitir conexiones de la App
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"status": "Servidor Activo"}

# Endpoint para procesar la imagen con IA
@app.post("/procesar")
async def procesar(factura: UploadFile = File(...)):
    try:
        # Leer imagen y convertir a base64
        img_bytes = await factura.read()
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        
        # Llamada al motor de IA
        resultado = interpretacion.extraer_datos_factura([b64])
        
        # Mapeo de compatibilidad para asegurar nombres de campos
        if "items" in resultado and isinstance(resultado["items"], list):
            for item in resultado["items"]:
                if "codigoBarras" in item:
                    item["codigo_barras"] = item["codigoBarras"]
                if "precioUnitario" in item:
                    item["precio_unitario"] = item["precioUnitario"]
                    
        return resultado
    except Exception as e:
        print(f"DEBUG - Error en procesamiento: {str(e)}")
        return {"error": str(e)}

# Endpoint para guardar los datos recibidos (con lógica de carpetas por sucursal)
@app.post("/guardar-compartido")
async def guardar(datos: dict):
    try:
        # 1. Extraer nombre de sucursal (o usar 'General' si no se envió)
        sucursal = datos.get("sucursal", "General").strip().replace(" ", "_")
        
        # 2. Crear ruta de carpeta específica (ej: .../JSON/MinimarketLF)
        ruta_sucursal = os.path.join(interpretacion.OUTPUT_FOLDER, sucursal)
        os.makedirs(ruta_sucursal, exist_ok=True)
        
        # 3. Definir nombre del archivo y ruta completa
        nombre = f"factura_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        ruta_completa = os.path.join(ruta_sucursal, nombre)
        
        # 4. Guardar archivo
        with open(ruta_completa, 'w', encoding='utf-8') as f:
            json.dump(datos, f, indent=4, ensure_ascii=False)
            
        return {"status": "ok", "archivo": f"{sucursal}/{nombre}"}
    except Exception as e:
        print(f"DEBUG - Error al guardar: {str(e)}")
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    # Puerto dinámico para Render o local
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)
