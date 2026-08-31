const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const pool = new Pool({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgress",
  database: "db_localhost_santi",
});

pool.on("connect", async (client) => {
  try {
    await client.query("SET client_encoding = 'WIN1252'");
  } catch (err) {
    console.error("Error setting encoding:", err.message);
  }
});

pool.connect((err) => {
  if (err) {
    console.error("Error conectando a PostgreSQL:", err.message);
    return;
  }
  console.log("Conectado a PostgreSQL");
  pool.query(`ALTER TABLE det_bien_vto_producto ADD COLUMN IF NOT EXISTS estado VARCHAR(50)`).catch(e => console.error("Error adding estado column:", e.message));
});

app.get("/", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── BIEN SERVICIO ─────────────────────────────────────
app.get("/bien-servicio", async (req, res) => {
  try {
    const { q, grupo, activo } = req.query;
    let sql = `SELECT b.cod_grupo_bien_servicio, b.cod_bien_servicio, TRIM(b.desc_bien_servicio) as desc_bien_servicio,
                     b.codigo_barra, b.precio_costo, b.precio_venta, b.calc_porc, b.activo,
                     b.codigo_operativo, b.cant_existencia, b.existencia_minima,
                     TRIM(g.desc_grupo_bien_servicio) as desc_grupo_bien_servicio,
                     u.precio_unidad_2 as precio_mayorista, u.cantidad as mayorista_desde
              FROM bien_servicio b
              LEFT JOIN grupo_bien_servicio g ON g.cod_grupo_bien_servicio = b.cod_grupo_bien_servicio
              LEFT JOIN det_unidad_bien_servicio u ON u.cod_grupo_bien_servicio = b.cod_grupo_bien_servicio AND u.cod_bien_servicio = b.cod_bien_servicio
              WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (q) {
      sql += ` AND (TRIM(b.desc_bien_servicio) ILIKE $${idx} OR b.codigo_barra ILIKE $${idx} OR b.codigo_operativo ILIKE $${idx})`;
      params.push(`%${q}%`);
      idx++;
    }
    if (grupo) {
      sql += ` AND b.cod_grupo_bien_servicio = $${idx}`;
      params.push(parseInt(grupo));
      idx++;
    }
    if (activo === "S" || activo === "N") {
      sql += ` AND b.activo = $${idx}`;
      params.push(activo);
    }
    sql += " ORDER BY TRIM(b.desc_bien_servicio) LIMIT 200";

    const result = await pool.query(sql, params);
    res.json({ total: result.rows.length, items: result.rows });
  } catch (err) {
    console.error("Error en /bien-servicio:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put("/bien-servicio/:grupo/:codigo", async (req, res) => {
  try {
    const { grupo, codigo } = req.params;
    const { precio_costo, precio_venta, precio_mayorista, mayorista_desde, calc_porc, desc_bien_servicio, codigo_barra, codigo_operativo, cant_existencia, existencia_minima } = req.body;
    const updates = [];
    const params = [];
    let idx = 1;

    if (precio_costo !== undefined) { updates.push(`precio_costo = $${idx++}`); params.push(precio_costo); }
    if (precio_venta !== undefined) { updates.push(`precio_venta = $${idx++}`); params.push(precio_venta); }
    if (calc_porc !== undefined) { updates.push(`calc_porc = $${idx++}`); params.push(calc_porc); }
    if (desc_bien_servicio !== undefined) { updates.push(`desc_bien_servicio = $${idx++}`); params.push(desc_bien_servicio); }
    if (codigo_barra !== undefined) { updates.push(`codigo_barra = $${idx++}`); params.push(codigo_barra); }
    if (codigo_operativo !== undefined) { updates.push(`codigo_operativo = $${idx++}`); params.push(codigo_operativo); }
    if (cant_existencia !== undefined) { updates.push(`cant_existencia = $${idx++}`); params.push(cant_existencia); }
    if (existencia_minima !== undefined) { updates.push(`existencia_minima = $${idx++}`); params.push(existencia_minima); }

    if (updates.length > 0) {
      params.push(parseInt(grupo), parseInt(codigo));
      const sql = `UPDATE bien_servicio SET ${updates.join(", ")} WHERE cod_grupo_bien_servicio = $${idx++} AND cod_bien_servicio = $${idx}`;
      await pool.query(sql, params);
    }

    if (precio_mayorista !== undefined || mayorista_desde !== undefined) {
      const existing = await pool.query("SELECT nro_item FROM det_unidad_bien_servicio WHERE cod_grupo_bien_servicio = $1 AND cod_bien_servicio = $2 LIMIT 1", [parseInt(grupo), parseInt(codigo)]);
      if (existing.rows.length > 0) {
        const up = []; const upParams = []; let upIdx = 1;
        if (precio_mayorista !== undefined) { up.push(`precio_unidad_2 = $${upIdx++}`); upParams.push(precio_mayorista); }
        if (mayorista_desde !== undefined) { up.push(`cantidad = $${upIdx++}`); upParams.push(mayorista_desde); }
        upParams.push(parseInt(grupo), parseInt(codigo), existing.rows[0].nro_item);
        await pool.query(`UPDATE det_unidad_bien_servicio SET ${up.join(", ")} WHERE cod_grupo_bien_servicio = $${upIdx++} AND cod_bien_servicio = $${upIdx++} AND nro_item = $${upIdx}`, upParams);
      } else {
        await pool.query("INSERT INTO det_unidad_bien_servicio (cod_unidad2, cod_grupo_bien_servicio, cod_bien_servicio, cantidad, precio_unidad_2, nro_item) VALUES (1, $1, $2, $3, $4, 1)", [parseInt(grupo), parseInt(codigo), mayorista_desde || 1, precio_mayorista || 0]);
      }
    }

    if (updates.length === 0 && precio_mayorista === undefined && mayorista_desde === undefined) return res.status(400).json({ error: "Sin campos para actualizar" });
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── LOGIN ──────────────────────────────────────────────
app.post("/login", async (req, res) => {
  try {
    const { usuario, contrasena } = req.body;
    if (!usuario || !contrasena) return res.status(400).json({ error: "Usuario y contraseña requeridos" });
    const result = await pool.query(
      `SELECT cod_usuario, usuario, administrador FROM usuario WHERE usuario = $1 AND contrasena = $2 AND activo = 'S'`,
      [usuario, contrasena]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CREAR ARTÍCULO ────────────────────────────────────
app.post("/bien-servicio", async (req, res) => {
  try {
    const { desc_bien_servicio, codigo_barra, precio_costo, precio_venta, precio_mayorista, mayorista_desde, calc_porc, cant_existencia, existencia_minima, cod_usuario, cod_grupo_bien_servicio } = req.body;
    if (!desc_bien_servicio) return res.status(400).json({ error: "desc_bien_servicio requerido" });
    let cod_grupo = cod_grupo_bien_servicio;
    if (!cod_grupo) {
      const def = await pool.query("SELECT cod_grupo_bien_servicio FROM grupo_bien_servicio ORDER BY cod_grupo_bien_servicio LIMIT 1");
      if (def.rows.length === 0) return res.status(400).json({ error: "No hay grupos disponibles" });
      cod_grupo = def.rows[0].cod_grupo_bien_servicio;
    }
    if (codigo_barra) {
      const dup = await pool.query("SELECT cod_bien_servicio FROM bien_servicio WHERE codigo_barra = $1 AND activo = 'S'", [codigo_barra]);
      if (dup.rows.length > 0) return res.status(409).json({ error: "Ya existe un artículo con ese código de barras" });
    }
    const itemRes = await pool.query("SELECT COALESCE(MAX(cod_bien_servicio), 0) + 1 as next FROM bien_servicio WHERE cod_grupo_bien_servicio = $1", [cod_grupo]);
    const cod_bien = itemRes.rows[0].next;
    await pool.query(
      `INSERT INTO bien_servicio (cod_grupo_bien_servicio, cod_bien_servicio, desc_bien_servicio, codigo_barra, precio_costo, precio_venta, calc_porc, cant_existencia, existencia_minima, activo, cod_usuario, fecha_carga)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'S', $10, CURRENT_DATE)`,
      [cod_grupo, cod_bien, desc_bien_servicio, codigo_barra || null, precio_costo || 0, precio_venta || 0, calc_porc || 0, cant_existencia || 0, existencia_minima || 0, cod_usuario || 1]
    );
    if (precio_mayorista) {
      await pool.query("INSERT INTO det_unidad_bien_servicio (cod_unidad2, cod_grupo_bien_servicio, cod_bien_servicio, cantidad, precio_unidad_2, nro_item) VALUES (1, $1, $2, $3, $4, 1)", [cod_grupo, cod_bien, mayorista_desde || 1, precio_mayorista]);
    }
    res.json({ status: "ok", cod_grupo_bien_servicio: cod_grupo, cod_bien_servicio: cod_bien });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── VENCIMIENTOS ───────────────────────────────────────
app.get("/vencimientos", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.cod_grupo_bien_servicio, v.cod_bien_servicio, v.nro_item, v.fecha_vto,
              v.activo, v.revisado, v.ultima_revision, v.estado,
              TRIM(b.desc_bien_servicio) as desc_bien_servicio,
              b.codigo_barra, b.precio_costo, b.precio_venta
       FROM det_bien_vto_producto v
       JOIN bien_servicio b ON b.cod_grupo_bien_servicio = v.cod_grupo_bien_servicio
        AND b.cod_bien_servicio = v.cod_bien_servicio
       WHERE v.activo = 'S' AND v.revisado = false
       ORDER BY v.fecha_vto ASC`
    );
    res.json({ items: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/vencimientos", async (req, res) => {
  try {
    const { cod_grupo_bien_servicio, cod_bien_servicio, nro_item, fecha_vto, cod_usuario, estado } = req.body;
    if (!cod_grupo_bien_servicio || !cod_bien_servicio || !fecha_vto) return res.status(400).json({ error: "Faltan datos" });
    const maxItem = await pool.query(
      `SELECT COALESCE(MAX(nro_item), 0) + 1 as next FROM det_bien_vto_producto WHERE cod_grupo_bien_servicio = $1 AND cod_bien_servicio = $2`,
      [cod_grupo_bien_servicio, cod_bien_servicio]
    );
    const item = nro_item || maxItem.rows[0].next;
    await pool.query(
      `INSERT INTO det_bien_vto_producto (cod_grupo_bien_servicio, cod_bien_servicio, nro_item, fecha_vto, fecha_carga, hora_carga, activo, cod_usuario, estado)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, TO_CHAR(CURRENT_TIMESTAMP, 'HH24:MI:SS'), 'S', $5, $6)`,
      [cod_grupo_bien_servicio, cod_bien_servicio, item, fecha_vto, cod_usuario || null, estado || null]
    );
    res.json({ status: "ok", nro_item: item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/vencimientos/revisar", async (req, res) => {
  try {
    const { cod_grupo_bien_servicio, cod_bien_servicio, nro_item, fecha_vto, cod_usuario } = req.body;
    if (!cod_grupo_bien_servicio || !cod_bien_servicio) return res.status(400).json({ error: "Datos incompletos" });
    if (!fecha_vto) return res.status(400).json({ error: "fecha_vto requerida" });
    const old = await pool.query(
      `SELECT fecha_vto FROM det_bien_vto_producto WHERE cod_grupo_bien_servicio = $1 AND cod_bien_servicio = $2 AND fecha_vto = $3`,
      [cod_grupo_bien_servicio, cod_bien_servicio, fecha_vto]
    );
    if (!old.rows.length) return res.status(404).json({ error: "No se encontró el vencimiento" });
    const fecha_anterior = old.rows[0].fecha_vto;
    const upd = await pool.query(
      `UPDATE det_bien_vto_producto SET revisado = true, ultima_revision = CURRENT_TIMESTAMP WHERE cod_grupo_bien_servicio = $1 AND cod_bien_servicio = $2 AND fecha_vto = $3`,
      [cod_grupo_bien_servicio, cod_bien_servicio, fecha_vto]
    );
    if (!upd.rowCount) return res.status(404).json({ error: "No se pudo actualizar el vencimiento" });
    await pool.query(
      `INSERT INTO vencimientos_historial (cod_grupo_bien_servicio, cod_bien_servicio, nro_item, fecha_anterior, fecha_nueva, revisado, cod_usuario)
       VALUES ($1, $2, $3, $4, $5, true, $6)`,
      [cod_grupo_bien_servicio, cod_bien_servicio, nro_item || 1, fecha_anterior, fecha_vto, cod_usuario || null]
    );
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/vencimientos/inactivar", async (req, res) => {
  try {
    const { cod_grupo_bien_servicio, cod_bien_servicio, nro_item } = req.body;
    if (!cod_grupo_bien_servicio || !cod_bien_servicio) return res.status(400).json({ error: "Datos incompletos" });
    await pool.query(
      `UPDATE det_bien_vto_producto SET activo = 'N' WHERE cod_grupo_bien_servicio = $1 AND cod_bien_servicio = $2 AND nro_item = $3`,
      [cod_grupo_bien_servicio, cod_bien_servicio, nro_item || 1]
    );
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/vencimientos/historial", async (req, res) => {
  try {
    const { grupo, codigo } = req.query;
    let sql = `SELECT h.*, TRIM(b.desc_bien_servicio) as desc_bien_servicio FROM vencimientos_historial h JOIN bien_servicio b ON b.cod_grupo_bien_servicio = h.cod_grupo_bien_servicio AND b.cod_bien_servicio = h.cod_bien_servicio WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (grupo) { sql += ` AND h.cod_grupo_bien_servicio = $${idx++}`; params.push(parseInt(grupo)); }
    if (codigo) { sql += ` AND h.cod_bien_servicio = $${idx++}`; params.push(parseInt(codigo)); }
    sql += " ORDER BY h.created_at DESC LIMIT 50";
    const result = await pool.query(sql, params);
    res.json({ items: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GRUPOS ────────────────────────────────────────────
app.get("/grupos", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT g.cod_grupo_bien_servicio, g.desc_grupo_bien_servicio,
              COUNT(b.cod_bien_servicio) as total_items
       FROM grupo_bien_servicio g LEFT JOIN bien_servicio b USING(cod_grupo_bien_servicio)
       GROUP BY g.cod_grupo_bien_servicio, g.desc_grupo_bien_servicio
       ORDER BY g.desc_grupo_bien_servicio`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CLIENTES ──────────────────────────────────────────
app.get("/clientes", async (req, res) => {
  try {
    const { q, activo } = req.query;
    let sql = `SELECT cod_agencia, cod_cliente, TRIM(nom_cliente) as nom_cliente,
                     TRIM(nro_documento) as nro_documento, TRIM(dir_cliente) as dir_cliente,
                     TRIM(tel_cliente) as tel_cliente, TRIM(cel_cliente) as cel_cliente,
                     TRIM(email_cliente) as email_cliente, activo
              FROM cliente WHERE cod_agencia = 1`;
    const params = [];
    let idx = 1;
    if (q) {
      sql += ` AND (TRIM(nom_cliente) ILIKE $${idx} OR TRIM(nro_documento) ILIKE $${idx} OR TRIM(cel_cliente) ILIKE $${idx})`;
      params.push(`%${q}%`);
      idx++;
    }
    if (activo === "S" || activo === "N") {
      sql += ` AND activo = $${idx}`;
      params.push(activo);
    }
    sql += " ORDER BY TRIM(nom_cliente) LIMIT 100";
    const result = await pool.query(sql, params);
    res.json({ total: result.rows.length, items: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/clientes", async (req, res) => {
  try {
    const { nom_cliente, nro_documento, dir_cliente, tel_cliente, cel_cliente, email_cliente } = req.body;
    if (!nom_cliente) return res.status(400).json({ error: "nom_cliente requerido" });
    const maxRes = await pool.query("SELECT COALESCE(MAX(cod_cliente), 0) + 1 as next_cod FROM cliente WHERE cod_agencia = 1");
    const nextCod = maxRes.rows[0].next_cod;
    const usuRes = await pool.query("SELECT MIN(cod_usuario) as uid FROM usuario WHERE activo = 'S'");
    const usuId = usuRes.rows[0]?.uid || 1;
    const result = await pool.query(
      `INSERT INTO cliente (cod_agencia, cod_cliente, nom_cliente, nro_documento, dir_cliente, tel_cliente, cel_cliente, email_cliente, cod_usuario_carga)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING cod_cliente`,
      [nextCod, nom_cliente, nro_documento || null, dir_cliente || null, tel_cliente || null, cel_cliente || null, email_cliente || null, usuId]
    );
    res.json({ status: "ok", cod_cliente: result.rows[0].cod_cliente });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── VENTAS ────────────────────────────────────────────
app.get("/ventas", async (req, res) => {
  try {
    const { q, desde, hasta } = req.query;
    let sql = `SELECT v.cod_empresa, v.cod_pais, v.cod_comprobante_venta, v.nro_lote,
                      v.nro_comprobante_venta, v.fecha_comprobante, v.total_comprobante,
                      v.monto_pagado, v.saldo_comprobante, v.anulado,
                      TRIM(c.nom_cliente) as nom_cliente,
                      TRIM(v.descripcion_comp) as descripcion
               FROM comprobante_cliente_venta v
               LEFT JOIN cliente c ON c.cod_agencia = v.cod_agencia_cliente AND c.cod_cliente = v.cod_cliente
               WHERE v.cod_empresa = 1`;
    const params = [];
    let idx = 1;

    if (desde) { sql += ` AND v.fecha_comprobante >= $${idx++}`; params.push(desde); }
    if (hasta) { sql += ` AND v.fecha_comprobante <= $${idx++}`; params.push(hasta); }
    if (q) {
      sql += ` AND (v.nro_comprobante_venta ILIKE $${idx} OR TRIM(c.nom_cliente) ILIKE $${idx})`;
      params.push(`%${q}%`);
      idx++;
    }
    sql += " ORDER BY v.fecha_comprobante DESC, v.nro_comprobante_venta DESC LIMIT 50";
    const result = await pool.query(sql, params);
    res.json({ total: result.rows.length, items: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/ventas/:comp/:lote/:nro/:agencia/:timbrado/detalle", async (req, res) => {
  try {
    const { comp, lote, nro, agencia, timbrado } = req.params;
    const result = await pool.query(
      `SELECT d.nro_secuencia, d.cod_grupo_bien_servicio, d.cod_bien_servicio,
              TRIM(b.desc_bien_servicio) as desc_bien_servicio,
              d.cantidad_venta, d.precio_unitario_venta, d.total_venta,
              d.monto_iva, d.monto_descuentos
       FROM det_comprobante_venta d
       LEFT JOIN bien_servicio b ON b.cod_grupo_bien_servicio = d.cod_grupo_bien_servicio
         AND b.cod_bien_servicio = d.cod_bien_servicio
       WHERE d.cod_empresa = 1 AND d.cod_comprobante_venta = $1
         AND d.nro_lote = $2 AND d.nro_comprobante_venta = $3
         AND d.cod_agencia_emisora = $4 AND d.cod_timbrado = $5
       ORDER BY d.nro_secuencia`,
      [parseInt(comp), lote, nro, parseInt(agencia), parseInt(timbrado)]
    );
    res.json({ items: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── BACKUP CONFIG ─────────────────────────────────────
const fs = require("fs");
const { exec } = require("child_process");
const BACKUP_DIR = "C:\\Users\\Santiago\\Desktop\\Todo de Santiago\\backups_postgres";
const CONFIG_PATH = path.join(BACKUP_DIR, "config.json");

function getDefaultConfig() {
  return { hora: "03:00", dias: ["L","M","X","J","V","S","D"], maxBackups: 30 };
}

app.get("/backup-config", (req, res) => {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
      return res.json(cfg);
    }
    const cfg = getDefaultConfig();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    res.json(cfg);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

const DIAS_MAP = { L:"MON", M:"TUE", X:"WED", J:"THU", V:"FRI", S:"SAT", D:"SUN" };
const TASK_NAME = "PostgreSQL Backup db_localhost_santi";
const PS_SCRIPT = path.join(BACKUP_DIR, "backup_postgres.ps1");

app.put("/backup-config", (req, res) => {
  try {
    const cfg = { ...getDefaultConfig(), ...req.body };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));

    const enDias = (cfg.dias || []).map(d => DIAS_MAP[d]).filter(Boolean);
    const esDiario = enDias.length === 7;
    const schedule = esDiario ? "/SC DAILY" : `/SC WEEKLY /D ${enDias.join(",")}`;

    const psCmd = [
      `schtasks /Delete /TN "${TASK_NAME}" /F 2>$null`,
      `schtasks /Create /TN "${TASK_NAME}" ${schedule} /ST ${cfg.hora} /TR "powershell.exe -ExecutionPolicy Bypass -File '${PS_SCRIPT}'" /F`,
    ].join("; ");

    exec(psCmd, (err, stdout, stderr) => {
      if (err) {
        console.error("Error updating task:", err.message);
        return res.json({ status: "ok", taskWarning: err.message });
      }
      console.log("Task updated:", stdout);
      res.json({ status: "ok" });
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/backup-run", (req, res) => {
  const psCmd = `powershell.exe -ExecutionPolicy Bypass -File "${PS_SCRIPT}"`;
  exec(psCmd, { timeout: 600000 }, (err) => {
    if (err) console.error("Backup error:", err.message);
    else console.log("Backup manual completado");
  });
  res.json({ status: "ok", message: "Backup iniciado" });
});

app.get("/backup-files", (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return res.json({ files: [] });
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith(".backup"))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return { name: f, size: stat.size, date: stat.mtime };
      })
      .sort((a, b) => b.date - a.date);
    res.json({ files });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 10001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend local corriendo en http://0.0.0.0:${PORT}`);
});
