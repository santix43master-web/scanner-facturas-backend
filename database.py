import os
import json
import psycopg2
from psycopg2.extras import execute_values

DATABASE_URL = os.environ.get("DATABASE_URL", "")

def _get_conn():
    if not DATABASE_URL:
        return None
    try:
        return psycopg2.connect(DATABASE_URL)
    except Exception as e:
        print(f"[db] Error conectando: {e}")
        return None

def inicializar_db():
    conn = _get_conn()
    if not conn:
        print("[db] Sin DATABASE_URL, modo JSON nomas")
        return
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS facturas (
                id SERIAL PRIMARY KEY,
                numero TEXT,
                sucursal TEXT,
                vendedor TEXT,
                ruc TEXT,
                timbrado TEXT,
                fecha_emision TEXT,
                total_exentas NUMERIC DEFAULT 0,
                total_iva5 NUMERIC DEFAULT 0,
                total_iva10 NUMERIC DEFAULT 0,
                total_general NUMERIC DEFAULT 0,
                qr_content TEXT,
                raw JSONB,
                creado_en TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS items (
                id SERIAL PRIMARY KEY,
                factura_id INTEGER REFERENCES facturas(id) ON DELETE CASCADE,
                codigo INTEGER,
                codigo_barras TEXT,
                descripcion TEXT,
                cantidad NUMERIC DEFAULT 0,
                precio_unitario NUMERIC DEFAULT 0,
                precio_total NUMERIC DEFAULT 0,
                tipo_iva TEXT
            )
        """)
        conn.commit()
        cur.close()
        print("[db] Tablas creadas OK")
    except Exception as e:
        print(f"[db] Error creando tablas: {e}")
    finally:
        conn.close()

def guardar_factura(datos):
    conn = _get_conn()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO facturas (numero, sucursal, vendedor, ruc, timbrado,
                fecha_emision, total_exentas, total_iva5, total_iva10,
                total_general, qr_content, raw)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            datos.get("numeroFactura"),
            datos.get("sucursal"),
            datos.get("nombreVendedor"),
            datos.get("ruc"),
            datos.get("timbrado"),
            datos.get("fechaEmision"),
            datos.get("totalExentas", 0),
            datos.get("totalIva5", 0),
            datos.get("totalIva10", 0),
            datos.get("totalGeneral", 0),
            datos.get("qrContent"),
            json.dumps(datos, ensure_ascii=False),
        ))
        factura_id = cur.fetchone()[0]

        items = datos.get("items", [])
        if items:
            execute_values(cur, """
                INSERT INTO items (factura_id, codigo, codigo_barras, descripcion,
                    cantidad, precio_unitario, precio_total, tipo_iva)
                VALUES %s
            """, [
                (
                    factura_id,
                    it.get("codigo"),
                    it.get("codigo_barras") or it.get("codigoBarras"),
                    it.get("descripcion"),
                    it.get("cantidad", 1),
                    it.get("precio_unitario") or it.get("precioUnitario") or it.get("subtotal", 0) / max(it.get("cantidad", 1), 1) if it.get("subtotal") else (it.get("precio_unitario") or it.get("precioUnitario", 0)),
                    it.get("precio_total") or it.get("precioTotal") or it.get("subtotal", 0),
                    it.get("tipo_iva") or it.get("tipoIva"),
                )
                for it in items
            ])

        conn.commit()
        cur.close()
        print(f"[db] Factura #{factura_id} guardada OK")
        return factura_id
    except Exception as e:
        print(f"[db] Error guardando factura: {e}")
        conn.rollback()
        return None
    finally:
        conn.close()

def listar_facturas(sucursal=None, limite=100):
    conn = _get_conn()
    if not conn:
        return []
    try:
        cur = conn.cursor()
        if sucursal:
            cur.execute("""
                SELECT id, numero, sucursal, vendedor, fecha_emision,
                    total_general, creado_en
                FROM facturas WHERE sucursal = %s
                ORDER BY creado_en DESC LIMIT %s
            """, (sucursal, limite))
        else:
            cur.execute("""
                SELECT id, numero, sucursal, vendedor, fecha_emision,
                    total_general, creado_en
                FROM facturas ORDER BY creado_en DESC LIMIT %s
            """, (limite,))
        rows = cur.fetchall()
        cur.close()
        return [
            {
                "id": r[0], "numero": r[1], "sucursal": r[2],
                "vendedor": r[3], "fecha": r[4], "total": float(r[5]),
                "creado_en": str(r[6]),
            }
            for r in rows
        ]
    except Exception as e:
        print(f"[db] Error listando: {e}")
        return []
    finally:
        conn.close()

def obtener_factura(factura_id):
    conn = _get_conn()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, numero, sucursal, vendedor, ruc, timbrado,
                fecha_emision, total_exentas, total_iva5, total_iva10,
                total_general, qr_content, raw, creado_en
            FROM facturas WHERE id = %s
        """, (factura_id,))
        r = cur.fetchone()
        if not r:
            return None

        cur.execute("""
            SELECT codigo, codigo_barras, descripcion, cantidad,
                precio_unitario, precio_total, tipo_iva
            FROM items WHERE factura_id = %s
        """, (factura_id,))
        items = [
            {
                "codigo": i[0], "codigo_barras": i[1], "descripcion": i[2],
                "cantidad": float(i[3]), "precio_unitario": float(i[4]),
                "precio_total": float(i[5]), "tipo_iva": i[6],
            }
            for i in cur.fetchall()
        ]
        cur.close()

        return {
            "id": r[0], "numero": r[1], "sucursal": r[2], "vendedor": r[3],
            "ruc": r[4], "timbrado": r[5], "fecha": r[6],
            "total_exentas": float(r[7]), "total_iva5": float(r[8]),
            "total_iva10": float(r[9]), "total_general": float(r[10]),
            "qr_content": r[11], "raw": r[12], "creado_en": str(r[13]),
            "items": items,
        }
    except Exception as e:
        print(f"[db] Error obteniendo factura: {e}")
        return None
    finally:
        conn.close()

inicializar_db()
