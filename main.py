import os, json, base64, shutil, traceback, uuid
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import interpretacion  # módulo con la lógica de IA, QR, SIFEN, etc.

app = FastAPI()

# Permite peticiones desde cualquier origen (app móvil, dashboard web)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QRRequest(BaseModel):
    qr: str
    sucursal: str = "Sucursal 1"

class HtmlRequest(BaseModel):
    html: str = ""
    url: str = ""
    de_data: dict = None
    qr_params: dict = None

class GuardarRequest(BaseModel):
    sucursal: str = "Sucursal 1"

# Endpoint principal de procesamiento por IA (fotos de facturas)
@app.post("/procesar")
async def procesar(
    factura: list[UploadFile] = File(...),
    sucursal: str = Form("Sucursal 1"),
):
    try:
        imagenes = []
        for f in factura:
            contenido = await f.read()
            b64 = base64.b64encode(contenido).decode("utf-8")
            imagenes.append(b64)
        resultado = interpretacion.procesar_factura_con_ia(imagenes, sucursal)
        return resultado
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}

# Procesa un código QR de factura electrónica (SIFEN/KUDE)
@app.post("/procesar-qr")
async def procesar_qr(data: QRRequest):
    try:
        resultado = interpretacion.procesar_qr(data.qr)
        resultado["sucursal"] = data.sucursal
        return resultado
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}

# Procesa los datos extraídos del CaptchaWebView (HTML o DE data de SIFEN)
@app.post("/procesar-html-completo")
async def procesar_html_completo(data: HtmlRequest):
    try:
        resultado = interpretacion.parsear_html_completo_de(
            html=data.html, url=data.url,
            qr_params=data.qr_params, de_data=data.de_data,
        )
        return resultado
    except Exception as e:
        traceback.print_exc()
        return {"error": str(e)}

# Guarda una factura en el buzón del servidor (para el dashboard)
@app.post("/guardar-compartido")
async def guardar_compartido(data: dict):
    try:
        sucursal = data.get("sucursal", "Sucursal 1").replace(" ", "_")
        if not data.get("items"):
            return {"status": "error", "message": "sin items"}
        ruta_suc = os.path.join(interpretacion.OUTPUT_FOLDER, sucursal)
        os.makedirs(ruta_suc, exist_ok=True)
        nombre_archivo = f"{data.get('nombreVendedor', 'vacio')}_{data.get('numeroFactura', 'NN')}_{uuid.uuid4().hex[:8]}.json"
        ruta_completa = os.path.join(ruta_suc, nombre_archivo)
        with open(ruta_completa, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return {"status": "ok", "archivo": nombre_archivo, "ruta": ruta_completa}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Busca productos por código de barras en todas las facturas guardadas
@app.get("/buscar-producto/{codigo}")
async def buscar_producto(codigo: str):
    try:
        if not os.path.exists(interpretacion.OUTPUT_FOLDER):
            return {"resultados": []}
        resultados = []
        for carpeta in os.listdir(interpretacion.OUTPUT_FOLDER):
            ruta_carpeta = os.path.join(interpretacion.OUTPUT_FOLDER, carpeta)
            if not os.path.isdir(ruta_carpeta): continue
            for archivo in os.listdir(ruta_carpeta):
                if not archivo.endswith('.json'): continue
                try:
                    with open(os.path.join(ruta_carpeta, archivo), 'r', encoding='utf-8') as f:
                        datos = json.load(f)
                    items = datos.get("items", [])
                    for it in items:
                        cb = str(it.get("codigo_barras", "") or it.get("codigoBarras", "") or "")
                        c_int = str(it.get("codigo", "") or "")
                        desc = it.get("descripcion", "")
                        if cb == codigo or cb == codigo.zfill(13) or cb == codigo.zfill(8) or c_int == codigo:
                            resultados.append({
                                "descripcion": desc,
                                "precio": it.get("precio_unitario", 0) or it.get("precioUnitario", 0),
                                "vendedor": datos.get("nombreVendedor", "?"),
                                "fecha": datos.get("fechaEmision", "?"),
                                "factura": datos.get("numeroFactura", "?"),
                            })
                except: continue
        resultados.sort(key=lambda r: r.get("fecha", ""), reverse=True)
        return {"resultados": resultados}
    except Exception as e:
        return {"error": str(e), "resultados": []}

# Obtiene el historial de facturas de una sucursal
@app.get("/historial/{sucursal}")
async def obtener_historial(sucursal: str):
    try:
        ruta = os.path.join(interpretacion.OUTPUT_FOLDER, sucursal.replace(" ", "_"))
        if not os.path.exists(ruta):
            return {"facturas": []}
        facturas = []
        for archivo in os.listdir(ruta):
            if not archivo.endswith('.json'): continue
            try:
                with open(os.path.join(ruta, archivo), 'r', encoding='utf-8') as f:
                    datos = json.load(f)
                facturas.append({
                    "id": archivo.replace('.json', ''),
                    "vendedor": datos.get("nombreVendedor", "?"),
                    "numero": datos.get("numeroFactura", "?"),
                    "total": datos.get("totalGeneral", 0),
                    "fecha": datos.get("fechaEmision", "?"),
                    "items": len(datos.get("items", [])),
                })
            except: continue
        facturas.sort(key=lambda f: f.get("fecha", ""), reverse=True)
        return {"facturas": facturas}
    except Exception as e:
        return {"error": str(e), "facturas": []}

# Elimina una factura del servidor por ID o nombre de archivo
@app.post("/api/eliminar")
async def eliminar_factura(datos: dict):
    try:
        factura_id = datos.get("id", "").strip()
        sucursal = datos.get("sucursal", "").strip()
        archivo = datos.get("archivo", "").strip()

        if not factura_id and not archivo:
            return {"status": "error", "message": "Faltan datos"}

        nombre_archivo = archivo if archivo else f"{factura_id}.json"

        # Busca en la sucursal especificada o en todas
        if sucursal:
            candidatos = [sucursal, sucursal.replace("_", " ")]
        else:
            candidatos = os.listdir(interpretacion.OUTPUT_FOLDER) if os.path.exists(interpretacion.OUTPUT_FOLDER) else []

        for carpeta in candidatos:
            ruta = os.path.join(interpretacion.OUTPUT_FOLDER, carpeta, nombre_archivo)
            if os.path.exists(ruta):
                os.remove(ruta)
                return {"status": "ok", "mensaje": f"Eliminado {nombre_archivo}"}

        return {"status": "error", "message": "Archivo no encontrado"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)
