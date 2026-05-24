import os
import json
import base64
from datetime import datetime
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import interpretacion 

app = FastAPI()

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

# 1. PROCESAR IMAGEN
@app.post("/procesar")
async def procesar(factura: UploadFile = File(...)):
    try:
        img_bytes = await factura.read()
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        resultado = interpretacion.extraer_datos_factura([b64])
        
        if "items" in resultado and isinstance(resultado["items"], list):
            for item in resultado["items"]:
                if "codigoBarras" in item: item["codigo_barras"] = item["codigoBarras"]
                if "precioUnitario" in item: item["precio_unitario"] = item["precioUnitario"]
                    
        return resultado
    except Exception as e:
        return {"error": str(e)}

# 2. GUARDAR FACTURA EN SU BUZÓN (Carpeta por sucursal)
@app.post("/guardar-compartido")
async def guardar(datos: dict):
    try:
        sucursal = datos.get("sucursal", "General").strip().replace(" ", "_")
        ruta_sucursal = os.path.join(interpretacion.OUTPUT_FOLDER, sucursal)
        os.makedirs(ruta_sucursal, exist_ok=True)
        
        nombre = f"factura_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        ruta_completa = os.path.join(ruta_sucursal, nombre)
        
        with open(ruta_completa, 'w', encoding='utf-8') as f:
            json.dump(datos, f, indent=4, ensure_ascii=False)
            
        return {"status": "ok", "archivo": f"{sucursal}/{nombre}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# 3. LISTAR ARCHIVOS PENDIENTES (Para Delphi)
@app.get("/listar/{sucursal}")
async def listar(sucursal: str):
    ruta_sucursal = os.path.join(interpretacion.OUTPUT_FOLDER, sucursal)
    if not os.path.exists(ruta_sucursal):
        return {"archivos": []}
    archivos = [f for f in os.listdir(ruta_sucursal) if f.endswith('.json')]
    return {"archivos": archivos}

# 4. DESCARGAR Y BORRAR (Para que Delphi limpie el buzón tras recibir)
@app.get("/descargar/{sucursal}/{nombre_archivo}")
async def descargar(sucursal: str, nombre_archivo: str):
    try:
        ruta_archivo = os.path.join(interpretacion.OUTPUT_FOLDER, sucursal, nombre_archivo)
        with open(ruta_archivo, 'r', encoding='utf-8') as f:
            datos = json.load(f)
        
        # Una vez leído, se borra del servidor para mantener el buzón limpio
        os.remove(ruta_archivo)
        return datos
    except Exception as e:
        return {"error": "No se pudo descargar o borrar: " + str(e)}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)
