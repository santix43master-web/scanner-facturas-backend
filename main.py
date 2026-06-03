import os
import json
import base64
import re
import urllib.parse
from datetime import datetime
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import httpx

# Importar interpretacion con manejo de error
try:
    import interpretacion
    print("✅ Módulo interpretacion cargado correctamente")
    print(f"OUTPUT_FOLDER: {interpretacion.OUTPUT_FOLDER}")
except Exception as e:
    print(f"❌ Error al cargar interpretacion: {e}")
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
        "message": "Scanner R21 Backend",
        "interpretacion": "Cargado" if interpretacion else "No cargado"
    }

@app.get("/status")
def status():
    return {
        "status": "ok",
        "output_folder": getattr(interpretacion, 'OUTPUT_FOLDER', 'No configurado'),
        "api_key": "Configurado" if os.environ.get("API_KEY") else "No configurado"
    }

# 1. PROCESAR IMAGEN
@app.post("/procesar")
async def procesar(factura: UploadFile = File(...)):
    if not interpretacion:
        return {"error": "Módulo de interpretación no cargado"}
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
        return {"status": "error", "message": "Módulo no cargado"}
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
            "mensaje": f"Guardado en {sucursal_limpia}"
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

# 3. LISTAR ARCHIVOS
@app.get("/listar/{sucursal}")
async def listar(sucursal: str):
    if not interpretacion:
        return {"archivos": []}
    try:
        ruta_sucursal = os.path.join(interpretacion.OUTPUT_FOLDER, sucursal)
        if not os.path.exists(ruta_sucursal):
            return {"archivos": []}
        
        archivos = [f for f in os.listdir(ruta_sucursal) if f.endswith('.json')]
        return {"archivos": archivos}
    except Exception as e:
        return {"error": str(e)}

# 4. DESCARGAR Y BORRAR (VERSIÓN MEJORADA)
@app.get("/descargar/{sucursal}/{nombre_archivo}")
async def descargar(sucursal: str, nombre_archivo: str):
    if not interpretacion:
        return {"error": "Módulo no cargado"}
    try:
        # Intentamos varias formas del nombre de sucursal
        posibles_nombres = [
            sucursal,
            sucursal.replace("_", " "),
            "Minimarket_LF",
            "Minimarket LF",
            "Local_1",
            "Local 1"
        ]
        
        for nombre in posibles_nombres:
            ruta_archivo = os.path.join(interpretacion.OUTPUT_FOLDER, nombre, nombre_archivo)
            if os.path.exists(ruta_archivo):
                with open(ruta_archivo, 'r', encoding='utf-8') as f:
                    datos = json.load(f)
                
                # Borramos el archivo después de leerlo
                os.remove(ruta_archivo)
                return datos
        
        return {
            "error": "Archivo no encontrado",
            "sucursal_intentada": sucursal,
            "archivo": nombre_archivo,
            "mensaje": "Prueba con Minimarket_LF o Local_1"
        }
    except Exception as e:
        return {"error": str(e)}

# ── Helper: extraer datos del HTML de SIFEN ──────────────
def _extraer_sifen_html(html: str) -> dict:
    datos = {}
    # Buscar RUC del emisor
    m = re.search(r'RUC[^:]*:\s*(\d{6,8}-\d)', html)
    if m: datos["rucVendedor"] = m.group(1)
    # Nombre del emisor
    m = re.search(r'(?:Raz[oó]n Social|Contribuyente|Emisor)[^:]*:\s*([^<]+)', html, re.IGNORECASE)
    if m: datos["nombreVendedor"] = m.group(1).strip()
    # Número de factura
    m = re.search(r'N[°º]\s*(?:Factura|Comprobante|Documento)[^:]*:\s*(\d[\d-]*)', html, re.IGNORECASE)
    if m: datos["numeroFactura"] = m.group(1).strip()
    # Fecha
    m = re.search(r'Fecha[^:]*:\s*(\d{2}/\d{2}/\d{4})', html)
    if m: datos["fechaEmision"] = m.group(1)
    # Timbrado
    m = re.search(r'Timbrado[^:]*:\s*(\d+)', html)
    if m: datos["timbrado"] = m.group(1)
    # Total
    m = re.search(r'Total[^:]*:\s*([\d.,]+)', html)
    if m: datos["totalGeneral"] = float(m.group(1).replace(".", "").replace(",", "."))
    datos["fuente"] = "SIFEN QR"
    return datos


def _extraer_items_sifen_html(html: str) -> list:
    items = []
    # Intentar encontrar tabla de items en SIFEN HTML
    # Buscar filas de tabla con cantidad, descripción, precio
    filas = re.findall(
        r'<tr[^>]*>.*?<td[^>]*>(\d+)</td>.*?<td[^>]*>(.*?)</td>.*?<td[^>]*>([\d.,]+)</td>.*?<td[^>]*>([\d.,]+)</td>.*?</tr>',
        html, re.DOTALL
    )
    for cant, desc, p_unit, total in filas:
        items.append({
            "descripcion": re.sub(r'<[^>]+>', '', desc).strip(),
            "cantidad": int(cant),
            "precioUnitario": float(p_unit.replace(".", "").replace(",", ".")),
            "subtotal": float(total.replace(".", "").replace(",", ".")),
        })
    return items


# 5. PROCESAR QR (SIFEN/KUDE)
@app.post("/procesar-qr")
async def procesar_qr(datos: dict):
    qr = datos.get("qr", "").strip()
    if not qr:
        return {"error": "QR vacío"}

    # Si el QR es una URL de SIFEN, intentar extraer CDC de los parámetros
    try:
        parsed = urllib.parse.urlparse(qr)
        params = urllib.parse.parse_qs(parsed.query)
        cdc = params.get("c", [None])[0]
        nro_doc = params.get("d", [None])[0]
        nombre = params.get("n", [None])[0]
    except:
        cdc = nro_doc = nombre = None

    resultado = {
        "fuente": "SIFEN QR",
        "items": [],
    }
    if nombre:
        resultado["nombreVendedor"] = nombre
    if nro_doc:
        resultado["numeroFactura"] = nro_doc

    # Intentar obtener la página
    try:
        async with httpx.AsyncClient(verify=False, timeout=15) as client:
            resp = await client.get(qr, follow_redirects=True, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            })
            if resp.status_code == 200:
                html = resp.text
                datos_html = _extraer_sifen_html(html)
                resultado.update(datos_html)
                items = _extraer_items_sifen_html(html)
                if items:
                    resultado["items"] = items
    except Exception as e:
        resultado["error_servidor"] = str(e)

    return resultado


# 6. PROCESAR HTML COMPLETO (flujo captcha WebView — solo regex, sin IA)
@app.post("/procesar-html-completo")
async def procesar_html_completo(datos: dict):
    html = datos.get("html", "")
    de_data = datos.get("de_data")

    if not html and not de_data:
        return {"error": "Sin datos"}

    resultado = {"fuente": "SIFEN/KUDE QR", "items": []}

    # Si el JS injectado ya extrajo DE data estructurada
    if de_data and isinstance(de_data, dict):
        gcam = (de_data.get("gCamItem") or
                (de_data.get("DE") or {}).get("gCamItem") or
                ((de_data.get("DE") or {}).get("gDtipDE") or {}).get("gCamItem"))
        if gcam:
            items_list = gcam if isinstance(gcam, list) else [gcam]
            for it in items_list:
                item_data = it.get("gItem") or it
                resultado["items"].append({
                    "descripcion": (item_data.get("dDesItem") or item_data.get("descripcion") or "").strip(),
                    "cantidad": float(item_data.get("dCanProSer", 1) or item_data.get("cantidad", 1)),
                    "precioUnitario": float(item_data.get("dPreUniProSer", 0) or item_data.get("precioUnitario", 0)),
                    "subtotal": float(item_data.get("dTotItem", 0) or item_data.get("subtotal", 0)),
                    "codigo": item_data.get("dCodProSer") or item_data.get("codigo") or "",
                })
        for k, v in [("dRucEm", "rucVendedor"), ("dNomEm", "nombreVendedor"), ("dRucRec", "rucComprador"),
                     ("dNumDoc", "numeroFactura"), ("dTimEst", "timbrado"), ("dFecEmi", "fechaEmision")]:
            if de_data.get(k): resultado[v] = de_data[k]
        if de_data.get("dTotOpe"): resultado["totalGeneral"] = float(de_data["dTotOpe"])
        return resultado

    # Extraer del HTML con regex
    resultado.update(_extraer_sifen_html(html))
    items = _extraer_items_sifen_html(html)
    if items:
        resultado["items"] = items
    return resultado


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)
