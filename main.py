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
    return {
        "status": "Servidor Activo",
        "modelo": interpretacion.MODELO,
    }

@app.get("/status")
def status():
    return {
        "status": "ok",
        "modelo": interpretacion.MODELO,
        "output_folder": interpretacion.OUTPUT_FOLDER,
        "api_key": "Configurado" if os.environ.get("OPENAI_API_KEY") else "No configurado",
    }

@app.post("/procesar")
async def procesar(factura: UploadFile = File(...)):
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

@app.post("/guardar-compartido")
async def guardar(datos: dict):
    try:
        sucursal = datos.get("sucursal", "General").strip()
        sucursal_limpia = sucursal.replace(" ", "_").replace("/", "_").replace("\\", "_")

        ruta_sucursal = os.path.join(interpretacion.OUTPUT_FOLDER, sucursal_limpia)
        os.makedirs(ruta_sucursal, exist_ok=True)

        nombre = f"factura_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        ruta_completa = os.path.join(ruta_sucursal, nombre)

        with open(ruta_completa, 'w', encoding='utf-8') as f:
            json.dump(datos, f, indent=4, ensure_ascii=False)

        return {
            "status": "ok",
            "sucursal": sucursal_limpia,
            "archivo": nombre,
            "mensaje": f"Guardado en {sucursal_limpia}",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/listar/{sucursal}")
async def listar(sucursal: str):
    try:
        ruta_sucursal = os.path.join(interpretacion.OUTPUT_FOLDER, sucursal)
        if not os.path.exists(ruta_sucursal):
            return {"archivos": []}
        archivos = [f for f in os.listdir(ruta_sucursal) if f.endswith('.json')]
        return {"archivos": archivos}
    except Exception as e:
        return {"error": str(e)}

@app.get("/descargar/{sucursal}/{nombre_archivo}")
async def descargar(sucursal: str, nombre_archivo: str):
    try:
        posibles_nombres = [
            sucursal,
            sucursal.replace("_", " "),
            "Minimarket_LF",
            "Minimarket LF",
            "Local_1",
            "Local 1",
        ]

        for nombre in posibles_nombres:
            ruta_archivo = os.path.join(interpretacion.OUTPUT_FOLDER, nombre, nombre_archivo)
            if os.path.exists(ruta_archivo):
                with open(ruta_archivo, 'r', encoding='utf-8') as f:
                    datos = json.load(f)
                os.remove(ruta_archivo)
                return datos

        return {
            "error": "Archivo no encontrado",
            "sucursal_intentada": sucursal,
            "archivo": nombre_archivo,
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)
