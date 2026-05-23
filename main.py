import base64
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# 🚀 IMPORTAMOS TU CÓDIGO DIRECTO (Sin copiar nada de lógica acá)
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
    return {"status": "Servidor Activo "}

@app.post("/procesar")
async def procesar(factura: UploadFile = File(...)):
    try:
        # 1. Leemos la foto de la cámara del cel
        img_bytes = await factura.read()
        
        # 2. La convertimos a Base64 en memoria
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        
        # 3. LLAMAMOS DIRECTAMENTE A TU FUNCIÓN ORIGINAL de interpretacion.py
        resultado = interpretacion.extraer_datos_factura([b64])
        
        # 4. Compatibilidad para que tu App.js dibuje las tarjetas celestes
        if "items" in resultado:
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
        # Usamos la misma carpeta de red que definiste en tu archivo original
        import os
        from datetime import datetime
        import json
        
        os.makedirs(interpretacion.OUTPUT_FOLDER, exist_ok=True)
        nombre = f"factura_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        ruta_completa = os.path.join(interpretacion.OUTPUT_FOLDER, nombre)
        
        with open(ruta_completa, 'w', encoding='utf-8') as f:
            json.dump(datos, f, indent=4, ensure_ascii=False)
            
        return {"status": "ok", "archivo": nombre}
    except Exception as e:
        return {"error": str(e)}

if __name__ == '__main__':
    import os
    # Render nos asigna un puerto automáticamente en esta variable de entorno
    puerto = int(os.environ.get("PORT", 5000))
    
    # Corremos la app en el host 0.0.0.0 y el puerto dinámico
    app.run(host='0.0.0.0', port=puerto)