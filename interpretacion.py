from __future__ import annotations
import os
import json
import re
import base64
import traceback
from pathlib import Path
from anthropic import Anthropic

# ── Configuración ──────────────────────────────────────────────
MODELO = os.environ.get("ANTHROPIC_MODEL", "claude-opus-4-7")

INPUT_FOLDER  = r"C:\Users\Family1\Desktop\trabajo de tanti\factura"
OUTPUT_FOLDER = os.environ.get("OUTPUT_FOLDER", r"\\192.168.100.16\Users\public\JSON")

client = Anthropic(api_key=os.environ.get("API_KEY"))

EXTENSIONES_VALIDAS = {".jpg", ".jpeg", ".png", ".webp"}

# ===================== CORRECCIÓN EAN-13 =====================
CONFUSIONES_VISUALES: list[tuple[str, str]] = [
    ("0", "8"), ("8", "0"), ("3", "0"), ("0", "3"),
    ("1", "7"), ("7", "1"), ("5", "6"), ("6", "5"),
    ("5", "9"), ("9", "5"), ("6", "8"), ("8", "6"),
    ("3", "8"), ("8", "3"), ("1", "4"), ("4", "1"),
    ("2", "7"), ("7", "2"), ("6", "9"), ("9", "6"),
    ("0", "6"), ("6", "0"), ("5", "8"), ("8", "5"),
    ("1", "l"), ("l", "1"), ("0", "O"), ("O", "0"),
    ("0", "7"), ("7", "0"), ("9", "4"), ("4", "9"),
    ("5", "2"), ("2", "5"), ("1", "8"), ("8", "1"),
    ("3", "7"), ("7", "3"),
]

_CHAR_MAP = {"l": "1", "I": "1", "O": "0", "o": "0", "S": "5", "s": "5",
             "B": "8", "G": "6", "g": "9", "Z": "2", "z": "2"}

def _digito_verificador(primeros_12: str) -> int | None:
    if len(primeros_12) != 12 or not primeros_12.isdigit():
        return None
    impares = sum(int(primeros_12[i]) for i in range(0, 12, 2))
    pares   = sum(int(primeros_12[i]) for i in range(1, 12, 2))
    return (10 - ((impares + pares * 3) % 10)) % 10

def _es_valido(codigo: str) -> bool:
    if len(codigo) != 13 or not codigo.isdigit():
        return False
    dv = _digito_verificador(codigo[:12])
    return dv is not None and dv == int(codigo[12])

def _normalizar(codigo: str) -> str:
    resultado = ""
    for c in str(codigo):
        if c.isdigit():
            resultado += c
        elif c in _CHAR_MAP:
            resultado += _CHAR_MAP[c]
    return resultado

def _corregir_un_digito(codigo: str) -> str | None:
    for pos in range(13):
        original = codigo[pos]
        for a, b in CONFUSIONES_VISUALES:
            if original == a:
                candidato = codigo[:pos] + b + codigo[pos + 1:]
                if _es_valido(candidato):
                    return candidato
    return None

def _corregir_dos_digitos(codigo: str) -> str | None:
    for pos1 in range(13):
        orig1 = codigo[pos1]
        for a1, b1 in CONFUSIONES_VISUALES:
            if orig1 != a1:
                continue
            paso1 = codigo[:pos1] + b1 + codigo[pos1 + 1:]
            for pos2 in range(pos1 + 1, 13):
                orig2 = paso1[pos2]
                for a2, b2 in CONFUSIONES_VISUALES:
                    if orig2 != a2:
                        continue
                    candidato = paso1[:pos2] + b2 + paso1[pos2 + 1:]
                    if _es_valido(candidato):
                        return candidato
    return None

def _corregir_solo_dv(codigo: str) -> str | None:
    dv = _digito_verificador(codigo[:12])
    if dv is None:
        return None
    corregido = codigo[:12] + str(dv)
    return corregido if corregido != codigo else None

def _intentar_corregir(codigo: str) -> tuple[str, str] | tuple[None, None]:
    corregido = _corregir_un_digito(codigo)
    if corregido:
        return corregido, "1 dígito corregido visualmente"
    corregido = _corregir_dos_digitos(codigo)
    if corregido:
        return corregido, "2 dígitos corregidos visualmente"
    corregido = _corregir_solo_dv(codigo)
    if corregido and _es_valido(corregido):
        return corregido, "DV recalculado (¡OJO! Verificar)"
    return None, None

def corregir_codigos_ean(items: list[dict]) -> list[dict]:
    for item in items:
        raw = item.get("codigoBarras")
        if raw is None:
            continue
        codigo = _normalizar(str(raw))
        if len(codigo) != 13:
            continue
        if _es_valido(codigo):
            if str(raw) != codigo:
                item["codigoBarras"] = codigo
            continue
        corregido, estrategia = _intentar_corregir(codigo)
        if corregido:
            item["codigoBarras"] = corregido
            item.setdefault("observaciones", []).append(
                f"EAN corregido ({estrategia}): {codigo} → {corregido}"
            )
        else:
            item.setdefault("observaciones", []).append(
                f"EAN inválido no corregible: {codigo}"
            )
    return items

# ===================== PROMPT =====================
SYSTEM_PROMPT = """Eres un experto en lectura de facturas y tickets de venta paraguayos. Tu trabajo requiere precisión absoluta — un error en un código puede causar problemas graves de inventario.

METODOLOGÍA OBLIGATORIA — SEGUÍ ESTOS PASOS EN ORDEN:

PASO 1 — ANALIZAR ESTRUCTURA:
Identificá los encabezados de columnas del documento antes de extraer.
Formatos comunes en Paraguay:
- Tickets térmicos: COD. | CANT. | DESP. | PRECIO | TOTAL
- Facturas tradicionales: Cant. | Descripción | Precio Unit. | Total
- Supermercados: Código | Artículo | Cant. | Precio | Importe
- Facturas con doble código: Cod.Art | Cód.Barras | Descripción | Cant. | Precio | Total
- Facturas de dos líneas: [codigo] [descripcion] / PV:[precio] [cantidad] [IVA%] [total]
IMPORTANTE: El valor bajo COD. es siempre el CÓDIGO, NUNCA la cantidad.

PASO 2 — EXTRAER ENCABEZADO FISCAL:
Extraé con precisión:
- RUC del VENDEDOR/PROVEEDOR
- Número de factura formato XXX-XXX-XXXXXXX
- Timbrado
- Fecha de emisión DD/MM/YYYY
- Total general
- Monto exento
- Monto gravado IVA 5%
- Monto gravado IVA 10%

PASO 3 — EXTRAER TODOS LOS ITEMS CON MÁXIMA PRECISIÓN:
Montos en guaraníes: "8.000"=8000 | "1.386.700"=1386700 (eliminar puntos de miles)

REGLAS CRÍTICAS PARA DÍGITOS — LEELOS CON EXTREMO CUIDADO:
- Leé cada dígito de forma INDIVIDUAL e INDEPENDIENTE
- NUNCA asumas el valor de un dígito basándote en los que lo rodean
- Dígitos visualmente similares en impresoras térmicas:
  * si lees solo 12 digitos agregale un 0 antes ejemplo: "772008000904" en ese caso agregas un 0 a la izquierda ejemplo: "0772008000904", no hagas la verificacion de EAN porque slo hay 12 numeros
  * No te confundas con los numeros cada uno tiene sus caracteristicas, revisalos bien
  * Acercate dígito por dígito, no leas el código de corrido , tomate tu tiempo
  * 5 vs 6: el 5 tiene parte superior PLANA, el 6 tiene curva COMPLETA arriba y abajo, pero no se cierra completamente como el 8
  * 3 vs 0: el 3 tiene DOS curvas ABIERTAS a la derecha, el 0 es OVAL CERRADO
  * 3 vs 8: el 3 está ABIERTO a la izquierda, el 8 es CERRADO completamente
  * 0 vs 8: el 0 tiene UN solo espacio interior, el 8 tiene DOS espacios interiores
  * 1 vs 7: el 1 es línea recta vertical, el 7 tiene trazo horizontal superior
  * 5 vs 9: el 9 se cierra por completo en la parte superior derecha
  * El 6 vs el 8 : el 6 tiene cola hacia abajo, el 8 tiene dos círculos
  * El 0 vs el 8 : el 0 es oval simple, el 8 tiene cintura
  * El 1 vs el 7 : el 7 tiene trazo diagonal y el 1 es recto parece un palito
  * El 6 vs el 0 : el 5 no se cierra por completo
  * El 5 vs el 8 : el 5 tiene el costado y la parte superior plana
  * Si tenés dudas sobre UN dígito, preferí el que hace válido el EAN-13
  * NUNCA inventes un dígito, si no lo ves claramente decí "?" en esa posición, y revisa detenidamente, no tengo prisa
  * El código tiene exactamente 13 dígitos, ni más ni menos, revisa bien para aseguararte
  * Para secuencias repetidas (666, 555, 000, 333): verificá CADA dígito individualmente, solo en algunos casos suele ser repetida

REGLAS CRÍTICAS PARA CÓDIGOS EAN-13:
Los códigos EAN-13 tienen EXACTAMENTE 13 dígitos y poseen un dígito verificador matemático.
Para verificar un EAN-13:
1. Tomá los primeros 12 dígitos
2. Sumá los dígitos en posición impar (1,3,5,7,9,11) * 1
3. Sumá los dígitos en posición par (2,4,6,8,10,12) * 3
4. Sumá ambos resultados
5. El dígito verificador = (10 - (suma / 10)) / 10
6. Debe coincidir con el dígito 13

Si el dígito verificador NO coincide → hay un error de lectura.
En ese caso revisá cada dígito individualmente prestando atención a las confusiones mencionadas arriba.

REGLAS PARA TIPOS DE CÓDIGO:
- Cod. Artículo interno (corto, numérico o alfanumérico): 1816, 58, yog350
- EAN-13 (exactamente 13 dígitos numéricos con dígito verificador válido)
Si hay ambos extraelos SEPARADOS en "codigo" y "codigoBarras"
Si solo hay uno: 13 dígitos → "codigoBarras", resto → "codigo"

DETECCIÓN DE CÓDIGOS EN COLUMNA DESCRIPCIÓN:
- "7840030002970--PACK BEB LACT" → codigoBarras=7840030002970, descripcion=PACK BEB LACT
- "YOG350 - YOGUR GRIEGO 180G" → codigo=YOG350, descripcion=YOGUR GRIEGO 180G

FORMATO ESPECIAL DE DOS LÍNEAS:
Línea 1: [codigo_articulo]    [descripcion]
Línea 2: PV: [precio]    [cantidad]    [IVA%]    [total]
Ejemplo:
  yog350    Yoghurt lactolanda 350 GR
  PV: 3.900    3    10%    11.700
→ codigo=yog350, descripcion=Yoghurt lactolanda 350 GR, precio=3900, cantidad=3, subtotal=11700
OTRO FORMATO ESPECIAL:
Linea 1: [descripcion]  [codigo_articulo]
Ejemplo:
    Nutrilea Cy Ac Niacinamida 12*190ml-7840508004925
→descripcion=Nutrilea Cy Ac Niacinamida 12*190ml, codigo=7840508004925

PASO 4 — VERIFICACIÓN MATEMÁTICA OBLIGATORIA:

A) Para cada item:
   - cantidad * precioUnitario = subtotal (tolerancia 1 Gs)
   - Si no cuadra → revisá dígitos confundidos
   - Revisar digito por dijito, la suma debe coincidir SIEMPRE

B) Suma de subtotales vs totalGeneral:
   - Suma > Total → hay DUPLICADOS → eliminá el repetido
   - Suma < Total → faltan ITEMS → buscalos en la imagen
   - Suma = Total → correcto ✓
   - Si la suma no coincide volver a revisar numero por numero cada numero es independiente no inventes numeros, hacelo hasta que la suma sea correcta.

PASO 5 — RESPONDÉ SOLO con JSON válido sin texto adicional ni markdown:
{
  "numeroFactura": "string o null",
  "fechaEmision": "string DD/MM/YYYY o null",
  "nombreVendedor": "string o null",
  "rucVendedor": "string o null (RUC del PROVEEDOR)",
  "rucComprador": "string o null (si aparece, sino null)",
  "timbrado": "string o null",
  "totalGeneral": number o null,
  "exenta": number o null,
  "gravada5": number o null,
  "gravada10": number o null,
  "observaciones": ["string — avisá duplicados eliminados, items agregados o dígitos corregidos"],
  "items": [
    {
      "codigo": "string o null (Cod. Artículo interno)",
      "codigoBarras": "string o null (EAN-13, exactamente 13 dígitos verificados)",
      "descripcion": "string",
      "cantidad": number,
      "precioUnitario": number,
      "subtotal": number
    }
  ]
}"""

# ===================== PARSEO =====================
def extraer_json_robusto(texto: str) -> dict:
    texto = texto.strip()
    match = re.search(r'(\{.*\})', texto, re.DOTALL)
    if match:
        texto = match.group(1)
    texto = texto.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(texto)
    except:
        try:
            texto_limpio = re.sub(r'[\n\r\t]+', ' ', texto)
            return json.loads(texto_limpio)
        except:
            print("   \u26a0\ufe0f No se pudo parsear el JSON")
            return {
                "items": [],
                "observaciones": ["ERROR: Sonnet no devolvió JSON válido"]
            }

# ===================== EXTRACCIÓN =====================
def extraer_datos_factura(imagenes_b64: list[str]) -> dict:
    if not imagenes_b64:
        return {"error": "Sin imagen"}

    image_content = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/jpeg",
                "data": b64,
            },
        }
        for b64 in imagenes_b64
    ]

    user_text = (
        f"Son {len(imagenes_b64)} imágenes de UNA SOLA factura paraguaya (ej: mitad superior + mitad inferior).\n"
        "Combiná toda la información de todas las imágenes. NO dupliques items.\n"
        "Seguí los 5 pasos. Verificá el dígito verificador de cada EAN-13.\n"
        "Usá el totalGeneral como árbitro."
    )

    try:
        message = client.messages.create(
            model=MODELO,
            max_tokens=16000,
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[
                {
                    "role": "user",
                    "content": [*image_content, {"type": "text", "text": user_text}],
                }
            ],
        )

        content = message.content[0].text.strip()
        result = extraer_json_robusto(content)

        if result.get("items"):
            result["items"] = corregir_codigos_ean(result["items"])

        return result
    except Exception as e:
        print(f"ERROR en extraer_datos_factura: {traceback.format_exc()}")
        return {"error": str(e), "items": []}


# ===================== QR / SIFEN =====================
def _extraer_cdc_de_qr(qr_content: str) -> str | None:
    from urllib.parse import urlparse, parse_qs
    contenido = qr_content.replace("DEMO\n", "").replace("DEMO ", "").strip()
    print(f"[QR] Contenido limpio: {contenido[:150]}")
    if contenido.startswith("http"):
        params = parse_qs(urlparse(contenido).query)
        print(f"[QR] Parámetros encontrados: {list(params.keys())}")
        for key in ("m", "cdc", "CDC", "Id", "ld"):
            val = params.get(key, [None])[0]
            if val:
                print(f"[QR] {key}={val[:20]}... (len={len(val)})")
                if len(val) >= 40:
                    return val
    elif len(contenido) >= 40:
        print(f"[QR] Contenido directo: {contenido[:30]}...")
        return contenido
    print("[QR] ❌ No se encontró CDC")
    return None

def _descargar_xml_sifen(cdc: str) -> str | None:
    import httpx, re, json
    try:
        headers_api = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json, application/xml, text/xml, */*",
            "Authorization": "afsdafasf9408539lfsasfas",
            "Content-type": "application/json",
        }
        # 1) Intentar API interna de SIFEN (devuelve JSON con el DE)
        cdc_clean = cdc.replace("DEMO\n", "").strip()
        url_json = f"https://ekuatia.set.gov.py/docs/documento-electronico"
        try:
            print(f"[QR] Intentando API JSON: POST {url_json}")
            resp = httpx.post(url_json, json={"cdc": cdc_clean}, headers=headers_api, timeout=20, follow_redirects=True)
            print(f"[QR] API JSON Status: {resp.status_code}, Tamaño: {len(resp.text)}")
            if resp.status_code == 200 and resp.text.strip():
                try:
                    data = resp.json()
                    if data.get("DE") and data["DE"].get("xml"):
                        xml_str = data["DE"]["xml"]
                        print(f"[QR] ✅ XML extraído de API JSON ({len(xml_str)} chars)")
                        return xml_str
                except:
                    pass
        except Exception as ex:
            print(f"[QR] Error API JSON: {ex}")

        # 2) Intentar GET docs/documento-electronico-xml/{cdc} con sesión persistente
        url_get_xml = f"https://ekuatia.set.gov.py/docs/documento-electronico-xml/{cdc_clean}"
        try:
            h = {"User-Agent": "Mozilla/5.0", "Accept": "application/json, application/xml, */*"}
            with httpx.Client() as s:
                s.get("https://ekuatia.set.gov.py/consultas/", headers=h, timeout=10)
                resp = s.get(url_get_xml, headers=h, timeout=20, follow_redirects=True)
            print(f"[QR] API XML GET (con sesión): Status {resp.status_code}, Tamaño: {len(resp.text)}")
            if resp.status_code == 200 and resp.text.strip():
                texto = resp.text.strip()
                print(f"[QR] Inicio respuesta: {texto[:200]}")
                es_xml = texto.startswith("<?xml") or texto.startswith("<rDE") or texto.startswith("<DE")
                if es_xml:
                    print("[QR] ✅ Es XML directo")
                    return texto
                try:
                    data = json.loads(texto)
                    if isinstance(data, dict) and data.get("xml"):
                        print("[QR] ✅ XML dentro de JSON")
                        return data["xml"]
                except:
                    pass
        except Exception as ex:
            print(f"[QR] Error API XML GET: {ex}")

        # 3) URLs legacy como fallback
        headers_legacy = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/xml, text/xml, */*",
        }
        urls = [
            f"https://ekuatia.set.gov.py/consultas/descargar-xml?cdc={cdc_clean}",
            f"https://ekuatia.set.gov.py/sifen/descargar-xml?cdc={cdc_clean}",
        ]
        for url in urls:
            try:
                print(f"[QR] Intentando legacy: {url[:80]}...")
                resp = httpx.get(url, headers=headers_legacy, timeout=15, follow_redirects=True)
                if resp.status_code == 200 and resp.text.strip():
                    texto = resp.text.strip()
                    if texto.startswith("<?xml") or texto.startswith("<rDE") or texto.startswith("<DE"):
                        print("[QR] ✅ Es XML (legacy)")
                        return texto
            except Exception:
                continue
    except Exception as ex:
        print(f"[QR] Error general: {ex}")
        return None
    print("[QR] ❌ Ninguna URL devolvió XML")
    return None

def _parsear_xml_sifen(xml_str: str) -> dict | None:
    import xmltodict, re
    try:
        xml_clean = re.sub(r'\s+xmlns[^=]*="[^"]*"', "", xml_str, count=0)
        data = xmltodict.parse(xml_clean)
        rde = {k.replace("ns0:", "").replace("rDE", ""): v for k, v in (data.get(list(data)[0]) or {}).items()}
        return rde
    except Exception:
        return None

def _descargar_html_consulta(qr_content: str) -> str | None:
    import httpx, re
    try:
        contenido = qr_content.replace("DEMO\n", "").replace("DEMO ", "").strip()
        if not contenido.startswith("http"):
            return None
        headers = {"User-Agent": "Mozilla/5.0", "Accept": "text/html,*/*"}
        resp = httpx.get(contenido, headers=headers, timeout=15, follow_redirects=True)
        if resp.status_code == 200:
            return resp.text
    except Exception:
        return None
    return None

def _extraer_cdc_de_html(html: str) -> str | None:
    import re
    patrones = [
        r'/(?:descargar-xml|descargar-kude)\?cdc=([a-zA-Z0-9]{40,48})',
        r'cdc[=:]\s*["\']?([a-zA-Z0-9]{40,48})',
        r'Id["\']?\s*[:=]\s*["\']?(\d{44})',
        r'[?&]cdc=([a-zA-Z0-9]{40,48})',
        r'data-cdc=["\']([a-zA-Z0-9]{40,48})',
    ]
    for pat in patrones:
        m = re.search(pat, html, re.IGNORECASE)
        if m:
            print(f"[QR] CDC en HTML ({m.group(1)[:20]}...)")
            return m.group(1)
    return None

def _parsear_html_kude(html: str) -> dict | None:
    """Raspa los datos de la página de consulta KUDE (HTML)."""
    import re
    try:
        datos = {}
        # Buscar datos en tablas o etiquetas <td>, <th>, <label>
        html_plano = re.sub(r'<[^>]+>', '|', html)
        html_plano = re.sub(r'\s+', ' ', html_plano)
        partes = [p.strip() for p in html_plano.split('|') if p.strip()]

        # Buscar RUC
        for i, p in enumerate(partes):
            lower = p.lower()
            if 'ruc' in lower and i + 1 < len(partes):
                val = partes[i + 1]
                if re.search(r'\d{4,}', val):
                    datos['rucVendedor'] = val

        # Buscar Razón Social / Nombre
        for i, p in enumerate(partes):
            lower = p.lower()
            if any(x in lower for x in ('razón social', 'razon social', 'nombre', 'denominación', 'denominacion')):
                if i + 1 < len(partes):
                    val = partes[i + 1]
                    if len(val) > 3 and not val.startswith('http') and not val.isdigit():
                        datos['nombreVendedor'] = val

        # Buscar Total
        for i, p in enumerate(partes):
            lower = p.lower()
            if 'total general' in lower or 'total' in lower and 'iva' not in lower:
                for j in range(i, min(i + 5, len(partes))):
                    m = re.search(r'([\d,.]+)', partes[j])
                    if m:
                        try:
                            val = float(m.group(1).replace('.', '').replace(',', '.'))
                            datos['totalGeneral'] = val
                        except:
                            pass

        # Buscar Fecha
        for p in partes:
            m = re.search(r'(\d{2})/(\d{2})/(\d{4})', p)
            if m:
                datos['fechaEmision'] = p
                break

        # Buscar Timbrado
        for i, p in enumerate(partes):
            if 'timbrado' in p.lower() and i + 1 < len(partes):
                m = re.search(r'(\d{8,})', partes[i + 1])
                if m:
                    datos['timbrado'] = m.group(1)
                    break

        # Buscar Número Factura
        for p in partes:
            m = re.search(r'(\d{3}-\d{3}-\d{7,})', p)
            if m:
                datos['numeroFactura'] = m.group(1)
                break

        if datos.get('totalGeneral') or datos.get('rucVendedor'):
            print(f"[QR] HTML parseado: {json.dumps(datos, ensure_ascii=False)[:200]}")
            return {
                "numeroFactura": datos.get('numeroFactura'),
                "fechaEmision": datos.get('fechaEmision'),
                "nombreVendedor": datos.get('nombreVendedor'),
                "rucVendedor": datos.get('rucVendedor'),
                "rucComprador": None,
                "timbrado": datos.get('timbrado'),
                "totalGeneral": datos.get('totalGeneral'),
                "exenta": None, "gravada5": None, "gravada10": None,
                "observaciones": ["Datos extraídos de la página de consulta SIFEN/KUDE (sin XML). Usá foto + IA para items exactos."],
                "items": [],
                "fuente": "HTML KUDE",
            }

        print(f"[QR] HTML completo ({len(html)} chars):\n{html}")
        print("[QR] No se pudieron extraer datos del HTML")
        return None
    except Exception as e:
        print(f"[QR] Error parseando HTML: {e}")
        return None

def parsear_html_completo_de(html: str = "", url: str = "", qr_params: dict = None, de_data: dict = None) -> dict:
    """Parse the full DE page HTML or raw DE data from Angular scope
    after captcha is solved on SIFEN WebView."""
    import re
    if qr_params is None:
        qr_params = {}

    # Caso 1: Ya tenemos datos parseados desde Angular scope
    if de_data:
        import json as _json
        print(f"[HTML] de_data type={type(de_data).__name__}, keys={list(de_data.keys())[:15]}")
        de_inner = de_data.get("DE", {})
        print(f"[HTML] DE keys={list(de_inner.keys())[:20]}")
        if isinstance(de_inner, dict):
            for k, v in de_inner.items():
                if isinstance(v, list):
                    print(f"[HTML] DE.{k} es lista con {len(v)} items")
                    if v and isinstance(v[0], dict):
                        print(f"[HTML] DE.{k}[0] keys={list(v[0].keys())[:10]}")
                elif isinstance(v, dict):
                    subkeys = list(v.keys())[:10]
                    print(f"[HTML] DE.{k} es dict con keys={subkeys}")
        items = de_data.get("items", [])
        gcam_raw = (de_data.get("gCamItem") or 
                    de_data.get("DE", {}).get("gCamItem") or
                    de_data.get("DE", {}).get("gDtipDE", {}).get("gCamItem"))
        if isinstance(gcam_raw, list):
            print(f"[HTML] gCamItem lista tiene {len(gcam_raw)} items")
            for it in gcam_raw:
                items.append({
                    "codigo": it.get("dCodInt"),
                    "codigoBarras": it.get("dCodBar"),
                    "descripcion": it.get("dDesProSer", ""),
                    "cantidad": float(it.get("dCamCant", 1) or 1),
                    "precioUnitario": float(it.get("dPUniProSer", 0) or 0),
                    "subtotal": float(it.get("dSubTot", 0) or 0),
                })
        if not items and isinstance(gcam_raw, dict):
            gitem = gcam_raw.get("gItem", []) or []
            if isinstance(gitem, dict):
                gitem = [gitem]
            if gitem and isinstance(gitem[0], dict):
                print(f"[HTML] gCamItem.gItem tiene {len(gitem)} items")
                for it in gitem:
                    items.append({
                        "codigo": it.get("dCodInt"),
                        "codigoBarras": it.get("dCodBar"),
                        "descripcion": it.get("dDesProSer", ""),
                        "cantidad": float(it.get("dCamCant", 1) or 1),
                        "precioUnitario": float(it.get("dPUniProSer", 0) or 0),
                        "subtotal": float(it.get("dSubTot", 0) or 0),
                    })
        if not items:
            de_inner = de_data.get("DE", {})
            for key in de_inner:
                val = de_inner[key]
                if isinstance(val, list) and len(val) > 0 and isinstance(val[0], dict) and any(k in val[0] for k in ("dDesProSer", "dSubTot", "dCamCant")):
                    print(f"[HTML] Items encontrados en DE.{key} ({len(val)} items)")
                    for it in val:
                        items.append({
                            "codigo": it.get("dCodInt"),
                            "codigoBarras": it.get("dCodBar"),
                            "descripcion": it.get("dDesProSer", ""),
                            "cantidad": float(it.get("dCamCant", 1) or 1),
                            "precioUnitario": float(it.get("dPUniProSer", 0) or 0),
                            "subtotal": float(it.get("dSubTot", 0) or 0),
                        })
                    break
                if isinstance(val, dict):
                    for k2, v2 in val.items():
                        if isinstance(v2, list) and len(v2) > 0 and isinstance(v2[0], dict) and any(k in v2[0] for k in ("dDesProSer", "dSubTot", "dCamCant")):
                            print(f"[HTML] Items encontrados en DE.{key}.{k2} ({len(v2)} items)")
                            for it in v2:
                                items.append({
                                    "codigo": it.get("dCodInt"),
                                    "codigoBarras": it.get("dCodBar"),
                                    "descripcion": it.get("dDesProSer", ""),
                                    "cantidad": float(it.get("dCamCant", 1) or 1),
                                    "precioUnitario": float(it.get("dPUniProSer", 0) or 0),
                                    "subtotal": float(it.get("dSubTot", 0) or 0),
                                })
                            break
        de = de_data.get("DE", de_data)
        return {
            "numeroFactura": de.get("dNumDoc") or qr_params.get("i") or qr_params.get("dNumDoc"),
            "fechaEmision": de.get("dFecEmi", "").replace("-", "/")[:10] if de.get("dFecEmi") else None,
            "nombreVendedor": de.get("dNomEm") or de_data.get("gEmis", {}).get("dNomEm"),
            "rucVendedor": de.get("dRucEm") or de_data.get("gEmis", {}).get("dRucEm"),
            "rucComprador": qr_params.get("dRucRec"),
            "timbrado": de.get("dTimb"),
            "totalGeneral": float(de.get("dTotGralOpe", 0) or 0) or float(de_data.get("gTotSub", {}).get("dTotGralOpe", 0) or 0),
            "exenta": float(de_data.get("gTotSub", {}).get("dTotGralOpeExe", 0) or 0) if de_data.get("gTotSub") else None,
            "gravada5": float(de_data.get("gTotSub", {}).get("dTotGralOpeIva5", 0) or 0) if de_data.get("gTotSub") else None,
            "gravada10": float(de_data.get("gTotSub", {}).get("dTotGralOpeIva10", 0) or 0) if de_data.get("gTotSub") else None,
            "observaciones": [f"Datos extraídos de SIFEN vía WebView ({len(items)} items)"],
            "items": items,
            "fuente": "SIFEN/KUDE completa (WebView captcha)",
        }

    # Caso 2: Parsear desde HTML
    if not html:
        return {"error": "Sin datos para procesar", "items": []}

    datos = {}
    items = []

    texto = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
    texto = re.sub(r'<style[^>]*>.*?</style>', '', texto, flags=re.DOTALL | re.IGNORECASE)
    texto = re.sub(r'<[^>]+>', '\n', texto)
    texto = re.sub(r'\n\s*\n', '\n', texto)
    lineas = [l.strip() for l in texto.split('\n') if l.strip()]

    for i, l in enumerate(lineas):
        lower = l.lower()
        m = re.search(r'ruc[^\d]*([\d\-]{6,})', l, re.IGNORECASE)
        if m and not datos.get('rucVendedor'):
            datos['rucVendedor'] = re.sub(r'[^\d]', '', m.group(1))
        m = re.search(r'(\d{3}-\d{3}-\d{7,})', l)
        if m and not datos.get('numeroFactura'):
            datos['numeroFactura'] = m.group(1)
        m = re.search(r'(\d{2}/\d{2}/\d{4})', l)
        if m and not datos.get('fechaEmision'):
            datos['fechaEmision'] = m.group(1)
        m = re.search(r'timbrado[^\d]*(\d{8,})', l, re.IGNORECASE)
        if m and not datos.get('timbrado'):
            datos['timbrado'] = m.group(1)
        if any(x in lower for x in ('razón social', 'razon social', 'denominación', 'denominacion', 'nombre del emisor')):
            for j in range(i, min(i + 3, len(lineas))):
                c = lineas[j]
                if len(c) > 5 and not c.startswith('http') and not c.strip().isdigit():
                    datos['nombreVendedor'] = c
                    break
        if 'total general' in lower or 'total gs' in lower:
            for j in range(i, min(i + 5, len(lineas))):
                m2 = re.search(r'([\d,.]+)', lineas[j])
                if m2:
                    try:
                        datos['totalGeneral'] = float(m2.group(1).replace('.', '').replace(',', '.'))
                    except:
                        pass

    table_pat = re.compile(r'<table[^>]*>(.*?)</table>', re.DOTALL | re.IGNORECASE)
    for tbl in table_pat.finditer(html):
        rows = []
        row_pat = re.compile(r'<tr[^>]*>(.*?)</tr>', re.DOTALL | re.IGNORECASE)
        for r in row_pat.finditer(tbl.group(1)):
            cells = []
            cell_pat = re.compile(r'<t[dh][^>]*>(.*?)</t[dh]>', re.DOTALL | re.IGNORECASE)
            for c in cell_pat.finditer(r.group(1)):
                ct = re.sub(r'<[^>]+>', '', c.group(1))
                ct = re.sub(r'\s+', ' ', ct).strip()
                ct = ct.replace('\u00a0', ' ')
                if ct:
                    cells.append(ct)
            if cells:
                rows.append(cells)

        if len(rows) < 2:
            continue

        hdr = ' '.join(rows[0]).lower()
        if not any(x in hdr for x in ('descripci', 'cantidad', 'precio', 'código', 'codigo', 'importe', 'subtotal')):
            continue

        for row in rows[1:]:
            if len(row) < 2:
                continue
            rt = row[0].lower()
            if any(x in rt for x in ('total', 'subtotal', 'iva', 'exenta', 'gravada', 'son:')):
                continue

            num_cols = []
            for ci, cv in enumerate(row):
                c_clean = cv.replace('.', '').replace(',', '.').strip()
                try:
                    val = float(c_clean)
                    num_cols.append((ci, val))
                except ValueError:
                    pass

            non_num = [(ci, cv) for ci, cv in enumerate(row)
                       if ci not in {nc[0] for nc in num_cols}]
            item_desc = max(non_num, key=lambda x: len(x[1]))[1] if non_num else row[0]

            vals = [v for _, v in num_cols]
            item_qty, item_price, item_subtotal = 1, 0, 0
            if len(vals) >= 3:
                vs = sorted(vals)
                item_subtotal = vs[-1]
                item_qty = vs[0]
                item_price = vs[1]
            elif len(vals) == 2:
                item_qty = vals[0]
                item_subtotal = vals[1]
                item_price = round(item_subtotal / item_qty, 2) if item_qty else 0
            elif len(vals) == 1:
                item_subtotal = vals[0]

            if item_desc:
                items.append({
                    "codigo": None,
                    "codigoBarras": None,
                    "descripcion": item_desc,
                    "cantidad": item_qty,
                    "precioUnitario": round(item_price, 2),
                    "subtotal": round(item_subtotal, 2),
                })

    total_fallback = datos.get('totalGeneral')
    if not total_fallback and qr_params.get('dTotGralOpe'):
        try:
            total_fallback = float(qr_params['dTotGralOpe'])
        except:
            pass

    return {
        "numeroFactura": datos.get('numeroFactura'),
        "fechaEmision": datos.get('fechaEmision'),
        "nombreVendedor": datos.get('nombreVendedor'),
        "rucVendedor": datos.get('rucVendedor'),
        "rucComprador": qr_params.get('dRucRec'),
        "timbrado": datos.get('timbrado'),
        "totalGeneral": total_fallback,
        "exenta": None,
        "gravada5": None,
        "gravada10": None,
        "observaciones": [f"Datos extraídos de SIFEN vía WebView ({len(items)} items)"],
        "items": items,
        "fuente": "SIFEN/KUDE completa (WebView captcha)",
    }


def procesar_qr(qr_content: str) -> dict:
    from urllib.parse import urlparse, parse_qs
    import xmltodict, re

    # 1) Extraer CDC del QR
    cdc = _extraer_cdc_de_qr(qr_content)
    xml_str = None

    # 2) Descargar XML/JSON desde las APIs de SIFEN/KUDE
    if cdc:
        xml_str = _descargar_xml_sifen(cdc)

    # 3) Fallback: raspar HTML de la página de consulta
    if not xml_str:
        html = _descargar_html_consulta(qr_content)
        if html:
            resultado_html = _parsear_html_kude(html)
            if resultado_html:
                return resultado_html

    # 4) Último recurso: extraer datos básicos del QR mismo (sin items)
    if not xml_str:
        if qr_content.startswith("http"):
            params = parse_qs(urlparse(qr_content.replace("DEMO\n", "").replace("DEMO ", "").strip()).query)
            total = float(params.get("dTotGralOpe", [0])[0]) if params.get("dTotGralOpe") else None
            fecha_hex = params.get("dFeEmiDE", [None])[0]
            fecha = ""
            if fecha_hex:
                try:
                    fecha_bytes = bytes.fromhex(fecha_hex)
                    fecha_str = fecha_bytes.decode("utf-8")
                    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", fecha_str)
                    if m:
                        fecha = f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
                except Exception:
                    pass
            return {
                "numeroFactura": params.get("i", [None])[0] or params.get("dNumDoc", [None])[0],
                "fechaEmision": fecha or None,
                "nombreVendedor": None,
                "rucVendedor": params.get("n", [None])[0],
                "rucComprador": params.get("dRucRec", [None])[0],
                "timbrado": None,
                "totalGeneral": total,
                "exenta": None,
                "gravada5": None,
                "gravada10": float(params.get("dTotIVA", [0])[0]) if params.get("dTotIVA") else None,
                "observaciones": [f"QR procesado sin XML ({params.get('cItems', ['?'])[0]} items declarados). Usá foto + IA para los items."],
                "items": [],
                "fuente": "QR parcial",
            }

        return {"error": "No se pudo obtener datos del QR", "qr_content": qr_content[:200], "items": []}

    # Tiene XML → parsear
    print(f"[QR] Parseando XML ({len(xml_str)} chars)")
    xml_clean = re.sub(r'\s+xmlns[^=]*="[^"]*"', "", xml_str, count=0)
    if not xml_clean.strip().startswith("<"):
        return {"error": f"No es XML. Respuesta: {xml_str[:300]}", "items": []}
    try:
        raw = xmltodict.parse(xml_clean)
    except Exception as e:
        return {"error": f"Error parseando XML: {e}", "inicio": xml_str[:300], "items": []}

    keys_raw = list(raw.keys())
    print(f"[QR] Keys raw: {keys_raw}")
    rde_key = next((k for k in raw if k.endswith("rDE") or k.endswith("DE")), None)
    if not rde_key:
        return {"error": f"No se encontró rDE en XML. Keys: {list(raw.keys())}", "xml_inicio": xml_str[:300], "items": []}
    rde = raw[rde_key]
    rde_keys = list(rde.keys())
    print(f"[QR] rDE keys: {rde_keys}")
    gdat = rde.get("gDatGralOpe", {}) or {}
    gdat_rec = gdat.get("gDatRec", {}) or {}
    gemis = rde.get("gEmis", {}) or {}
    gtot = rde.get("gTotSub", {}) or {}
    gcam = rde.get("gCamItem", {}) or {}

    ruc_v = gemis.get("dRucEm", "")
    nom_v = gemis.get("dNomEm", "")
    num_factura = gdat.get("dNumDoc", "")
    fecha = gdat_rec.get("dFecEmi", "") or gdat.get("dFecEmi", "")
    timbrado_raw = gdat.get("dTimb", "")

    total = float(gtot.get("dTotGralOpe", 0) or 0)
    exenta = float(gtot.get("dTotGralOpeExe", 0) or 0)
    grav5 = float(gtot.get("dTotGralOpeIva5", 0) or 0)
    grav10 = float(gtot.get("dTotGralOpeIva10", 0) or 0)

    gitems = gcam.get("gItem", []) or []
    if isinstance(gitems, dict):
        gitems = [gitems]

    items = []
    for it in gitems:
        items.append({
            "codigo": it.get("dCodInt", None),
            "codigoBarras": it.get("dCodBar", None),
            "descripcion": it.get("dDesProSer", ""),
            "cantidad": float(it.get("dCamCant", 1) or 1),
            "precioUnitario": float(it.get("dPUniProSer", 0) or 0),
            "subtotal": float(it.get("dSubTot", 0) or 0),
        })

    return {
        "numeroFactura": num_factura or None,
        "fechaEmision": fecha[0:10].replace("-", "/") if fecha and "-" in fecha else fecha or None,
        "nombreVendedor": nom_v or None,
        "rucVendedor": ruc_v or None,
        "rucComprador": None,
        "timbrado": timbrado_raw or None,
        "totalGeneral": total,
        "exenta": exenta,
        "gravada5": grav5,
        "gravada10": grav10,
        "observaciones": ["Extraído desde SIFEN/KUDE QR (sin IA)"],
        "items": items,
        "fuente": "SIFEN/KUDE QR",
    }


def imagen_a_base64(ruta: Path) -> str:
    with open(ruta, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def procesar_carpeta():
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)
    archivos = sorted(
        p for p in Path(INPUT_FOLDER).iterdir()
        if p.suffix.lower() in EXTENSIONES_VALIDAS
    )
    if not archivos:
        print("No se encontraron imágenes.")
        return
    print(f"Encontradas {len(archivos)} imagen(es) → procesando una por una...\n")
    for archivo in archivos:
        print(f"  Procesando: {archivo.name} ...", end=" ", flush=True)
        try:
            b64 = imagen_a_base64(archivo)
            resultado = extraer_datos_factura([b64])
            salida = Path(OUTPUT_FOLDER) / f"{archivo.stem}.json"
            with open(salida, "w", encoding="utf-8") as f:
                json.dump(resultado, f, ensure_ascii=False, indent=2)
            print("\u2713")
        except Exception as e:
            print(f"\u2717 ERROR: {e}")
    print("\nListo.")


if __name__ == "__main__":
    if not os.environ.get("API_KEY"):
        raise SystemExit("Falta API_KEY")
    procesar_carpeta()
