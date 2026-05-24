import base64
import os
import json
from datetime import datetime
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
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

@app.post("/procesar")
async def procesar(factura: UploadFile = File(...)):
    try:
        # Leer bytes
        img_bytes = await factura.read()
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        
        # Llamada al motor de IA
        resultado = interpretacion.extraer_datos_factura([b64])
        
        # DIAGNÓSTICO: Imprimir lo que la IA devuelve a la consola de Render
        print("DEBUG - IA devolvió:", json.dumps(resultado, indent=2))
        
        # Mapeo de compatibilidad
        if "items" in resultado and isinstance(resultado["items"], list):
            for item in resultado["items"]:
                if "codigoBarras" in item:
                    item["codigo_barras"] = item["codigoBarras"]
                if "precioUnitario" in item:
                    item["precio_unitario"] = item["precioUnitario"]
                    
        return resultado
    except Exception as e:
        print("DEBUG - ERROR crítico:", str(e))
        return {"error": str(e)}

@app.post("/guardar-compartido")
async def guardar(datos: dict):
    try:
        os.makedirs(interpretacion.OUTPUT_FOLDER, exist_ok=True)
        nombre = f"factura_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        ruta_completa = os.path.join(interpretacion.OUTPUT_FOLDER, nombre)
        
        with open(ruta_completa, 'w', encoding='utf-8') as f:
            json.dump(datos, f, indent=4, ensure_ascii=False)
            
        return {"status": "ok", "archivo": nombre}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)
