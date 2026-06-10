import os
import json
import base64
from datetime import datetime
from typing import List
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
        "proveedor": os.environ.get("PROVEEDOR", "anthropic"),
        "output_folder": interpretacion.OUTPUT_FOLDER,
        "api_key": "Configurado" if os.environ.get("API_KEY") else "No configurado",
        "gemini_api_key": "Configurado" if os.environ.get("GEMINI_API_KEY") else "No configurado",
        "openai_api_key": "Configurado" if os.environ.get("OPENAI_API_KEY") else "No configurado",
    }

@app.post("/procesar")
async def procesar(factura: List[UploadFile] = File(...)):
    try:
        imagenes_b64 = []
        for i, f in enumerate(factura):
            img_bytes = await f.read()
            b64 = base64.b64encode(img_bytes).decode("utf-8")
            imagenes_b64.append(b64)
            print(f"[DEBUG] Imagen {i+1}: {len(img_bytes)} bytes, base64={len(b64)} chars")
        print(f"[DEBUG] Total imágenes recibidas: {len(imagenes_b64)}")
        resultado = interpretacion.extraer_datos_factura(imagenes_b64)

        if "items" in resultado and isinstance(resultado["items"], list):
            for item in resultado["items"]:
                if "codigoBarras" in item:
                    item["codigo_barras"] = item.pop("codigoBarras")
                if "precioUnitario" in item:
                    item["precio_unitario"] = item.pop("precioUnitario")

        return resultado
    except Exception as e:
        return {"error": str(e)}

@app.post("/procesar-qr")
def procesar_qr(data: dict):
    try:
        qr_content = data.get("qr", "")
        if not qr_content:
            return {"error": "QR vacío", "items": []}
        resultado = interpretacion.procesar_qr(qr_content)

        if "items" in resultado and isinstance(resultado["items"], list):
            for item in resultado["items"]:
                if "codigoBarras" in item:
                    item["codigo_barras"] = item.pop("codigoBarras")
                if "precioUnitario" in item:
                    item["precio_unitario"] = item.pop("precioUnitario")

        return resultado
    except Exception as e:
        return {"error": str(e), "items": []}


@app.post("/procesar-html-completo")
def procesar_html_completo(data: dict):
    try:
        html = data.get("html", "")
        url = data.get("url", "")
        qr_params = data.get("qr_params", {})

        if not html and not data.get("de_data"):
            return {"error": "HTML vacío", "items": []}

        resultado = interpretacion.parsear_html_completo_de(
            html=html, url=url, qr_params=qr_params,
            de_data=data.get("de_data"),
        )
        return resultado
    except Exception as e:
        return {"error": str(e), "items": []}


@app.post("/guardar-compartido")
async def guardar(datos: dict):
    try:
        sucursal = datos.get("sucursal", "General").strip()
        sucursal_limpia = sucursal.replace(" ", "_").replace("/", "_").replace("\\", "_")

        ruta_sucursal = os.path.join(interpretacion.OUTPUT_FOLDER, sucursal_limpia)
        os.makedirs(ruta_sucursal, exist_ok=True)

        vendedor = datos.get("nombreVendedor", "Desconocido")
        vendedor_limpio = re.sub(r'[\\/*?:"<>|]', '', vendedor).strip().replace(" ", "_")[:40]
        nro_factura = datos.get("numeroFactura", "SIN_NUM")
        nro_factura_limpio = re.sub(r'[\\/*?:"<>|]', '', nro_factura).strip().replace(" ", "_")[:20]
        nombre = f"{vendedor_limpio}_{nro_factura_limpio}.json"
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