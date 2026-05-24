import os
import json
import base64
from datetime import datetime
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Importamos con manejo de error
try:
    import interpretacion
    print("✅ interpretacion.py cargado correctamente")
    print(f"OUTPUT_FOLDER configurado en: {interpretacion.OUTPUT_FOLDER}")
except Exception as e:
    print(f"❌ ERROR al importar interpretacion: {e}")
    interpretacion = None

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
    return {
        "status": "Servidor Activo",
        "message": "API Scanner R21",
        "interpretacion_cargado": interpretacion is not None
    }

@app.get("/status")
def status():
    return {
        "status": "ok",
        "output_folder": getattr(interpretacion, 'OUTPUT_FOLDER', 'No cargado'),
        "api_key_configurado": bool(os.environ.get("API_KEY"))
    }

# 1. PROCESAR IMAGEN
@app.post("/procesar")
async def procesar(factura: UploadFile = File(...)):
    if not interpretacion:
        return {"error": "Módulo interpretacion no cargado"}
    try:
        img_bytes = await factura.read()
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        resultado = interpretacion.extraer_datos_factura([b64])
       
        if "items" in resultado and isinstance(resultado["items"], list):
            for item in resultado["items"]:
                if "codigoBarras" in item: 
                    item["codigo_barras"] = item["codigoBarras"]
                if "precioUnitario" in item: 
                    item["precio_unitario"] = item["precioUnitario"]
                   
        return resultado
    except Exception as e:
        return {"error": str(e)}

# 2. GUARDAR EN BUZÓN
@app.post("/guardar-compartido")
async def guardar(datos: dict):
    if not interpretacion:
        return {"status": "error", "message": "Módulo interpretacion no cargado"}
    try:
        sucursal = datos.get("sucursal", "General").strip()
        sucursal_limpia = sucursal.replace(" ", "_").replace("/", "_")
        
        ruta_sucursal = os.path.join(interpretacion.OUTPUT_FOLDER, sucursal_limpia)
        os.makedirs(ruta_sucursal, exist_ok=True)
       
        nombre = f"factura_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        ruta_completa = os.path.join(ruta_sucursal, nombre)
       
        with open(ruta_completa, 'w', encoding='utf-8') as f:
            json.dump(datos, f, indent=4, ensure_ascii=False)
           
        return {
            "status": "ok", 
            "sucursal": sucursal_limpia, 
            "archivo": nombre
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

# 3. LISTAR
@app.get("/listar/{sucursal}")
async def listar(sucursal: str):
    if not interpretacion:
        return {"archivos": [], "error": "Módulo no cargado"}
    try:
        ruta_sucursal = os.path.join(interpretacion.OUTPUT_FOLDER, sucursal)
        if not os.path.exists(ruta_sucursal):
            return {"archivos": []}
        archivos = [f for f in os.listdir(ruta_sucursal) if f.endswith('.json')]
        return {"archivos": archivos}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)
