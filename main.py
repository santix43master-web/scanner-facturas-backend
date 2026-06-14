import os
import json
import base64
import re
import shutil
from datetime import datetime
from typing import List
import time
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

import interpretacion

def _guardar_resultado(resultado):
    try:
        sucursal = resultado.get("sucursal") or resultado.get("nombreVendedor", "General")
        nombre_suc = sucursal.replace(" ", "_").replace("/", "_").replace("\\", "_")
        ruta_suc = os.path.join(interpretacion.OUTPUT_FOLDER, nombre_suc)
        os.makedirs(ruta_suc, exist_ok=True)
        vendedor = resultado.get("nombreVendedor", "Desconocido")
        v_limpio = re.sub(r'[\\/*?:"<>|]', '', vendedor).strip().replace(" ", "_")[:40]
        nro = resultado.get("numeroFactura", "SIN_NUM")
        n_limpio = re.sub(r'[\\/*?:"<>|]', '', nro).strip().replace(" ", "_")[:20]
        ts = str(int(time.time()))
        nombre = f"{v_limpio}_{n_limpio}_{ts}.json"
        with open(os.path.join(ruta_suc, nombre), 'w', encoding='utf-8') as f:
            json.dump(resultado, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"[guardar] No se pudo guardar: {e}")

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
async def procesar(factura: List[UploadFile] = File(...), sucursal: str = Form(None)):
    try:
        imagenes_b64 = []
        for i, f in enumerate(factura):
            img_bytes = await f.read()
            b64 = base64.b64encode(img_bytes).decode("utf-8")
            imagenes_b64.append(b64)
        resultado = interpretacion.extraer_datos_factura(imagenes_b64)

        if "items" in resultado and isinstance(resultado["items"], list):
            for item in resultado["items"]:
                if "codigoBarras" in item:
                    item["codigo_barras"] = item.pop("codigoBarras")
                if "precioUnitario" in item:
                    item["precio_unitario"] = item.pop("precioUnitario")

        resultado["sucursal"] = sucursal or resultado.get("nombreVendedor", "General")
        _guardar_resultado(resultado)
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

        resultado["sucursal"] = data.get("sucursal") or resultado.get("nombreVendedor", "General")
        _guardar_resultado(resultado)
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
        resultado["sucursal"] = data.get("sucursal") or resultado.get("nombreVendedor", "General")
        _guardar_resultado(resultado)
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


SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
SUPABASE_TABLE = "auth"


async def _supabase_guardar(data: str):
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise Exception("SUPABASE_URL o SUPABASE_KEY no configurados")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLE}",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates",
            },
            json={"id": 1, "data": data},
        )
        resp.raise_for_status()


async def _supabase_cargar():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise Exception("SUPABASE_URL o SUPABASE_KEY no configurados")
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/{SUPABASE_TABLE}",
            params={"id": "eq.1", "select": "data"},
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
        )
        resp.raise_for_status()
        rows = resp.json()
        if not rows:
            return None
        return rows[0].get("data")


@app.post("/auth-guardar")
async def auth_guardar(datos: dict):
    try:
        contenido = datos.get("auth", "")
        if not contenido:
            return {"status": "error", "message": "auth vacio"}
        await _supabase_guardar(contenido)
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/auth-cargar")
async def auth_cargar():
    try:
        contenido = await _supabase_cargar()
        if contenido is None:
            return {"status": "error", "message": "no hay auth guardado"}
        return {"status": "ok", "auth": contenido}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/buscar-producto/{codigo}")
async def buscar_producto(codigo: str):
    try:
        resultados = []
        for carpeta in os.listdir(interpretacion.OUTPUT_FOLDER):
            ruta = os.path.join(interpretacion.OUTPUT_FOLDER, carpeta)
            if not os.path.isdir(ruta): continue
            for archivo in os.listdir(ruta):
                if not archivo.endswith('.json'): continue
                try:
                    with open(os.path.join(ruta, archivo), 'r', encoding='utf-8') as f:
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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)