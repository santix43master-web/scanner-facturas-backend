from __future__ import annotations
import os
import json
import re
import base64
from pathlib import Path
import httpx
import socket
socket.setdefaulttimeout(30)

INPUT_FOLDER  = r"C:\Users\Family1\Desktop\trabajo de tanti\factura"
OUTPUT_FOLDER = r"\\192.168.100.16\Users\public\JSON"

client = Anthropic(
    api_key=os.environ.get("API_KEY")
)

EXTENSIONES_VALIDAS = {".jpg", ".jpeg", ".png", ".webp"}


# ===================== TUS FUNCIONES ORIGINALES (SIN CAMBIOS) =====================
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
            if orig1 != a1: continue
            paso1 = codigo[:pos1] + b1 + codigo[pos1 + 1:]
            for pos2 in range(pos1 + 1, 13):
                orig2 = paso1[pos2]
                for a2, b2 in CONFUSIONES_VISUALES:
                    if orig2 != a2: continue
                    candidato = paso1[:pos2] + b2 + paso1[pos2 + 1:]
                    if _es_valido(candidato):
                        return candidato
    return None


def _corregir_solo_dv(codigo: str) -> str | None:
    dv = _digito_verificador(codigo[:12])
    if dv is None: return None
    corregido = codigo[:12] + str(dv)
    return corregido if corregido != codigo else None


def _intentar_corregir(codigo: str) -> tuple[str, str] | tuple[None, None]:
    # 1. PRIMERO intentamos corregir errores visuales (lo más probable en una factura)
    corregido = _corregir_un_digito(codigo)
    if corregido:
        return corregido, "1 dígito corregido visualmente"

    corregido = _corregir_dos_digitos(codigo)
    if corregido:
        return corregido, "2 dígitos corregidos visualmente"

    # 2. ÚLTIMO RECURSO: Recalcular el DV (solo si lo visual no funcionó)
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
            item.setdefault("observaciones", []).append(f"EAN corregido ({estrategia}): {codigo} → {corregido}")
        else:
            item.setdefault("observaciones", []).append(f"EAN inválido no corregible: {codigo}")
    return items

# ─────────────────────────────────────────────
#  Prompt (idéntico al JS)
# ─────────────────────────────────────────────
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
- RUC del VENDEDOR/PROVEEDOR (no del cliente comprador)
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
{" NO TENGO APURO, UN ERROR PODRIA OCASIONANR UN PROBLEMA DE INVENTARIO"
  "numeroFactura": "string o null",
  "fechaEmision": "string DD/MM/YYYY o null",
  "nombreVendedor": "string o null",
  "rucVendedor": "string o null (RUC del PROVEEDOR)",
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


# ===================== PARSER JSON ROBUSTO (ÚNICO CAMBIO) =====================
def extraer_json_robusto(texto: str) -> dict:
    """Fix para el error 'Expecting value: line 1 column 1 (char 0)'"""
    texto = texto.strip()
    
    # Buscar el JSON aunque Claude ponga texto antes
    match = re.search(r'(\{.*\})', texto, re.DOTALL)
    if match:
        texto = match.group(1)
    
    texto = texto.replace("```json", "").replace("```", "").strip()
    
    try:
        return json.loads(texto)
    except:
        try:
            # Segundo intento más agresivo
            texto_limpio = re.sub(r'[\n\r\t]+', ' ', texto)
            return json.loads(texto_limpio)
        except:
            print("   ⚠️ No se pudo parsear el JSON")
            return {
                "items": [],
                "observaciones": ["ERROR: Claude no devolvió JSON válido"]
            }


# ===================== EXTRACCIÓN (solo se cambió el parseo) =====================
def extraer_datos_factura(imagenes_b64: list[str]) -> dict:
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
        f"Estas {len(imagenes_b64)} imágenes son partes de UNA SOLA factura paraguaya.\n"
        "ADVERTENCIA: Las fotos pueden tener zonas superpuestas.\n"
        "Seguí los 5 pasos. Verificá el dígito verificador de cada EAN-13.\n"
        "Usá el totalGeneral como árbitro."
    )

    payload = {
        "model": "claude-opus-4-7",
        "max_tokens": 6000,
        "system": SYSTEM_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": [*image_content, {"type": "text", "text": user_text}],
            }
        ],
    }

    with httpx.Client(timeout=180) as client:   # timeout aumentado
        response = client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "Content-Type": "application/json",
                "x-api-key": API_KEY,
                "anthropic-version": "2023-06-01",
            },
            json=payload,
        )

    if response.status_code != 200:
        raise RuntimeError(f"Anthropic API error {response.status_code}: {response.text}")

    content = response.json()["content"][0]["text"].strip()
    result = extraer_json_robusto(content)

    if result.get("items"):
        result["items"] = corregir_codigos_ean(result["items"])

    return result


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
            b64        = imagen_a_base64(archivo)
            resultado  = extraer_datos_factura([b64])
            salida     = Path(OUTPUT_FOLDER) / f"{archivo.stem}.json"

            with open(salida, "w", encoding="utf-8") as f:
                json.dump(resultado, f, ensure_ascii=False, indent=2)

            print("✓")
        except Exception as e:
            print(f"✗ ERROR: {e}")

    print("\nListo.")


if __name__ == "__main__":
    if not API_KEY or "sk-ant" not in API_KEY:
        raise SystemExit("Falta ANTHROPIC_API_KEY")
    procesar_carpeta()

    