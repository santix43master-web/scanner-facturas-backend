const http = require('http');
const { default: makeWASocket, useMultiFileAuthState, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const OpenAI = require('openai');


const SUCURSALES_VALIDAS = ["Minimarket LF", "Local 1"];

const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'https://scanner-facturas-backend.onrender.com';
const IP_LOCAL_URL = process.env.IP_LOCAL_URL || 'https://snooze-chafe-bullwhip.ngrok-free.dev';
const AUTH_DIR = './auth_info';

let ultimoQR = null;
let estadoConexion = 'desconectado';

const server = http.createServer(async (req, res) => {
  const url = req.url;

  if (url === '/qr') {
    const qrLink = ultimoQR ? `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(ultimoQR)}` : '';
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bot Facturas R21 - QR</title>
<style>body{font-family:sans-serif;text-align:center;padding:20px;background:#111;color:#fff}
h1{color:#25D366}img{max-width:90vw;border-radius:12px;box-shadow:0 0 30px rgba(37,211,102,.3)}
p{color:#aaa;margin-top:20px}.estado{display:inline-block;padding:6px 16px;border-radius:20px;font-size:14px}
.conectado{background:#25D366;color:#000}.desconectado{background:#e74c3c;color:#fff}.conectando{background:#f39c12;color:#000}
</style></head><body>
<h1>Bot Facturas R21</h1>
<p>Estado: <span class="estado ${estadoConexion}">${estadoConexion}</span></p>
${ultimoQR ? `<p>Escaneá este QR con WhatsApp:</p><img src="${qrLink}" alt="QR Code"/>` : '<p>Esperando QR...</p>'}
</body></html>`);
  }

  if (url.startsWith('/ver-json/')) {
    const nombre = decodeURIComponent(url.slice(10));
    try {
      const resp = await fetch(`${BACKEND_URL}/descargar/WhatsApp/${encodeURIComponent(nombre)}`);
      const data = await resp.json();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(data, null, 2));
    } catch {
      res.writeHead(500);
      return res.end('{"error":"Error al obtener archivo"}');
    }
  }

  if (url === '/archivos') {
    try {
      const resp = await fetch(`${BACKEND_URL}/listar/WhatsApp`);
      const { archivos = [] } = await resp.json();
      const items = archivos.map(a => `<div class="archivo">
        <span class="nombre">${a}</span>
        <div class="acciones">
          <a class="ver" href="/ver-json/${encodeURIComponent(a)}" target="_blank">Ver</a>
          <a class="descargar" href="${BACKEND_URL}/descargar/WhatsApp/${encodeURIComponent(a)}">Descargar</a>
        </div></div>`).join('');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(`<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Archivos - Facturas R21</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f0f2f5;padding:20px;color:#333}
h1{color:#1a237e;margin-bottom:8px}
.sub{color:#666;margin-bottom:24px;font-size:14px}
.card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.archivo{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f0f0f0}
.archivo:last-child{border-bottom:none}
.nombre{font-size:14px;flex:1}
.acciones a{text-decoration:none;font-size:13px;padding:4px 12px;border-radius:6px;margin-left:8px}
.ver{background:#e8eaf6;color:#1a237e}
.descargar{background:#1a237e;color:#fff}
.vacio{color:#999;font-size:14px;padding:20px 0;text-align:center}
</style></head><body>
<h1>Facturas R21</h1>
<p class="sub">Archivos JSON guardados</p>
<div class="card">${items || '<div class="vacio">No hay archivos guardados.</div>'}</div>
</body></html>`);
    } catch {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end('{"error":"Error al conectar con el backend"}');
    }
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: estadoConexion, qr: !!ultimoQR, bot: 'Facturas R21 WhatsApp Bot', archivos: 'https://whatsapp-facturas-bot.onrender.com/archivos' }));
});
server.listen(PORT, () => console.log(`✅ HTTP server on port ${PORT}`));

const usuarios = {};
const sentIds = new Set();

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

async function interpretarGPT(mensaje, contexto, jid = null) {
  if (!openai) return null;

  const hist = [];
  if (jid && usuarios[jid]?.historial) {
    for (const h of usuarios[jid].historial) hist.push(h);
  }

  const prompt = `Sos el asistente de facturación Facturas R21 en WhatsApp. Ayudas a procesar fotos de facturas.

Contexto: ${JSON.stringify(contexto)}

Respondé SOLO con un JSON sin markdown:
{
  "intent": "SET_USERNAME | SHOW_DETAIL | GET_JSON | GET_PDF | SEND_TO_SYSTEM | SEND_TO_LOCAL | STATS | DEACTIVATE | CHAT | ACTIVATE | UNKNOWN",
  "respuesta": "tu respuesta en español, breve, natural, sin emojis",
  "username": "solo si intent SET_USERNAME"
}

Reglas:
- Sos una persona real, no un bot. Hablá con confianza, como un amigo paraguayo
- Nunca digas "no entiendo", "no puedo", "no estoy seguro", "como IA", "soy un asistente"
- Si el usuario está ACTIVO: sé cálido, empático, con personalidad. Reíte, jodé, preguntale cómo está. NO seas apurado ni robot
- Cuando te pregunten "cómo estás", "qué tal": respondé como persona, ej: "Tranquilo che, acá nomas. Y vos?" o "Bien mi hermano, aguantando. Decime", siempre variá
- Si te cuentan algo (cansado, ocupado, etc.): mostrá empatía, ej "Uf te entiendo, este calor no ayuda" o "Fuerza che, ya falta poco"
- Siempre guiá suavemente hacia lo que necesite, pero sin apuro. Si solo quiere hablar, charlá un rato
- Saludos casuales ("que tal", "hola", "como estas", "buenas"): CHAT + respuesta natural y humana, ofrecé ayuda si querés
- Si el usuario da un usuario, fijate si coincide (case insensitive) con: ${JSON.stringify(SUCURSALES_VALIDAS)}
- Si coincide, SET_USERNAME + username exacto
- Si no, responded que no existe (intent CHAT)
- Opciones de factura:
  "1", "detalle", "mostrame", "items", "ver detalle" → SHOW_DETAIL
  "2", "json", "descargar json", "bajar json", "dame el json" → GET_JSON
  "3", "pdf", "descargar pdf", "bajar pdf", "dame el pdf" → GET_PDF
  "4", "enviar", "sistema", "guardar", "mandar al sistema" → SEND_TO_SYSTEM
  "5", "carpeta", "compartida", "local", "enviar a carpeta" → SEND_TO_LOCAL
- "chau bot", "gracias", "adios", "terminamos" → DEACTIVATE
- Consultas de estadisticas: "cuanto gaste", "estadisticas", "historial", "facturas de", "mostrame facturas", "total del mes", "promedio", "cuanto tengo guardado" → STATS
- Si intent STATS: responded breve tipo "Dame un segundo reviso tus facturas" sin numeros
- Si el usuario esta inactivo (no ha activado el bot):
  * NO respondas a nada. Silencio total hasta que pida activar
  * Si quiere activar ("hola bot", "che bot", "quiero escanear", "activate", "empecemos") → ACTIVATE y pedí el usuario
  * Cualquier otra cosa → UNKNOWN (el bot no responde)
- Si el usuario dice "chau", "gracias", "terminamos" → DEACTIVATE + borra la sesion. Despues vuelve a estar inactivo.`;

  const messages = [{ role: 'system', content: prompt }];
  for (const msg of hist) messages.push(msg);
  messages.push({ role: 'user', content: mensaje });

  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 200,
    });
    const res = JSON.parse(r.choices[0].message.content);

    if (jid && res?.respuesta) {
      if (!usuarios[jid]) usuarios[jid] = {};
      if (!usuarios[jid].historial) usuarios[jid].historial = [];
      usuarios[jid].historial.push({ role: 'user', content: mensaje });
      usuarios[jid].historial.push({ role: 'assistant', content: res.respuesta });
      if (usuarios[jid].historial.length > 6) usuarios[jid].historial = usuarios[jid].historial.slice(-6);
    }

    return res;
  } catch {
    return null;
  }
}

async function descargarImagen(msg) {
  const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image');
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function procesarFactura(buffer) {
  const FormData = require('form-data');
  const form = new FormData();
  form.append('factura', buffer, { filename: 'factura.jpg', contentType: 'image/jpeg' });
  const res = await fetch(`${BACKEND_URL}/procesar`, {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  });
  return await res.json();
}

function formatearResultado(datos) {
  if (datos.error) return `Error: ${datos.error}`;
  let texto = `Listo, acá están los datos de la factura:\n\n`;
  texto += `Vendedor: ${datos.nombreVendedor || 'Desconocido'}\n`;
  texto += `Factura N°: ${datos.numeroFactura || 'Sin número'}\n`;
  texto += `Fecha: ${datos.fechaEmision || 'Sin fecha'}\n`;
  texto += `Total: ${Number(datos.totalGeneral || 0).toLocaleString()} Gs\n`;
  const cantItems = (datos.items || []).length;
  texto += `Artículos: ${cantItems}\n`;
  texto += `Fuente: R21 Scanner\n\n`;
  texto += `Decime qué querés hacer:\n`;
  texto += `1 - Ver detalle completo\n`;
  texto += `2 - Bajar JSON\n`;
  texto += `3 - Bajar PDF\n`;
  texto += `4 - Enviar al sistema\n`;
  texto += `5 - Enviar a carpeta compartida\n`;
  texto += `\nMandame el número nomas.`;
  return texto;
}

function formatearDetalle(datos) {
  if (!datos.items || datos.items.length === 0) return 'No se detectaron artículos.';
  let texto = `Detalle completo:\n\n`;
  texto += `${datos.nombreVendedor || '?'} - RUC ${datos.rucVendedor || '?'}\n`;
  texto += `Factura N° ${datos.numeroFactura || '?'} - Timbrado ${datos.timbrado || '?'}\n`;
  texto += `Fecha: ${datos.fechaEmision || '?'}\n`;
  if (datos.rucComprador) texto += `Comprador: ${datos.rucComprador}\n`;
  texto += `\nArtículos:\n`;
  datos.items.forEach((it, i) => {
    texto += `${i+1}. ${it.descripcion || '?'}`;
    if (it.codigo) texto += ` (Cod: ${it.codigo})`;
    if (it.codigo_barras) texto += ` [Bar: ${it.codigo_barras}]`;
    texto += `\n   ${it.cantidad || 1} x ${Number(it.precio_unitario || 0).toLocaleString()} = ${Number(it.subtotal || 0).toLocaleString()} Gs\n`;
  });
  texto += `\nTotal: ${Number(datos.totalGeneral || 0).toLocaleString()} Gs`;
  return texto;
}

function generarPDFBuffer(datos) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const gs = (n) => Number(n || 0).toLocaleString() + ' Gs';
    const azul = '#1a237e';
    const azulClaro = '#e8eaf6';
    const verde = '#00bcd4';
    const gris = '#fafafa';
    const borde = '#e0e0e0';

    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#ffffff');

    // Header banner
    doc.rect(0, 0, doc.page.width, 130).fill(azul);
    doc.rect(0, 125, doc.page.width, 8).fill(verde);

    doc.fill('#ffffff').fontSize(30).font('Helvetica-Bold').text('FACTURA', 40, 35, { align: 'center' });
    doc.fontSize(13).font('Helvetica').text('Documento Electrónico', { align: 'center' });
    doc.fill('#b3b3ff').fontSize(10).text(`RUC: ${datos.rucVendedor || '---'}`, 40, 85, { align: 'center' });
    doc.fill('#000000');

    // Info cards
    const infoY = 158;
    const cardW = (doc.page.width - 100) / 2;
    const infoItems = [
      { label: 'VENDEDOR', value: datos.nombreVendedor || '---' },
      { label: 'N° FACTURA', value: datos.numeroFactura || '---' },
      { label: 'TIMBRADO', value: datos.timbrado || '---' },
      { label: 'FECHA EMISION', value: datos.fechaEmision || '---' },
    ];

    infoItems.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 40 + col * (cardW + 10);
      const y = infoY + row * 38;

      doc.roundedRect(x, y, cardW, 32, 6).fill('#ffffff');
      doc.roundedRect(x, y, cardW, 32, 6).lineWidth(1).stroke(borde);
      doc.rect(x, y, 4, 32).fill(verde);
      doc.fill('#78909c').fontSize(8).font('Helvetica-Bold').text(item.label, x + 12, y + 5, { width: cardW - 20 });
      doc.fill('#212121').fontSize(10).font('Helvetica').text(item.value, x + 12, y + 16, { width: cardW - 20 });
    });

    // Items table
    if (datos.items && datos.items.length > 0) {
      let y = infoY + 85;

      // Table header
      doc.roundedRect(40, y, doc.page.width - 80, 24, 6).fill(azul);
      doc.fill('#ffffff').fontSize(9).font('Helvetica-Bold');
      doc.text('CODIGO', 50, y + 6, { width: 60 });
      doc.text('COD. BARRAS', 115, y + 6, { width: 65 });
      doc.text('DESCRIPCION', 185, y + 6, { width: 125 });
      doc.text('CANT', 315, y + 6, { width: 35 });
      doc.text('PRECIO', 355, y + 6, { width: 75 });
      doc.text('SUBTOTAL', 435, y + 6, { width: 80 });
      y += 24;

      // Table rows
      datos.items.forEach((it, i) => {
        const rowBg = i % 2 === 0 ? '#f5f7ff' : '#ffffff';
        doc.rect(40, y, doc.page.width - 80, 22).fill(rowBg);
        doc.rect(40, y, doc.page.width - 80, 22).lineWidth(0.5).stroke(borde);
        doc.fill('#424242').fontSize(8.5).font('Helvetica');
        doc.text(it.codigo || '-', 50, y + 5, { width: 60 });
        doc.text(it.codigo_barras || '-', 115, y + 5, { width: 65 });
        doc.text((it.descripcion || '?').slice(0, 30), 185, y + 5, { width: 125 });
        doc.text((it.cantidad || 1).toString(), 315, y + 5, { width: 35 });
        doc.text(Number(it.precio_unitario || 0).toLocaleString(), 355, y + 5, { width: 75 });
        doc.text(Number(it.subtotal || 0).toLocaleString(), 435, y + 5, { width: 80 });
        y += 22;
      });

      // Total card
      y += 12;
      doc.roundedRect(40, y, doc.page.width - 80, 42, 8).fill(azul);
      doc.fill('#ffffff').fontSize(11).font('Helvetica').text('TOTAL GENERAL', 55, y + 5, { width: doc.page.width - 130 });
      doc.fontSize(18).font('Helvetica-Bold').text(gs(datos.totalGeneral), 55, y + 18, { width: doc.page.width - 130 });
    } else {
      doc.fill('#9e9e9e').fontSize(12).font('Helvetica').text('No se detectaron artículos.', 40, 280);
    }

    // Footer
    doc.fillColor('#bdbdbd').fontSize(8).font('Helvetica');
    doc.text('Generado por Sistema de Facturación R21', 40, doc.page.height - 35, { align: 'center' });
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-PY')}`, 40, doc.page.height - 25, { align: 'center' });

    doc.end();
  });
}

async function enviarJSON(sock, jid, datos) {
  const tmpDir = '/tmp';
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const nombre = `${(datos.nombreVendedor || 'factura').replace(/[^a-zA-Z0-9]/g, '_')}_${datos.numeroFactura || 'sin_num'}.json`.slice(0, 80);
  const ruta = path.join(tmpDir, nombre);
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 2), 'utf-8');
  const buffer = fs.readFileSync(ruta);
  await sock.sendMessage(jid, { document: buffer, fileName: nombre, mimetype: 'application/json' });
  fs.unlinkSync(ruta);
}

async function enviarPDF(sock, jid, datos) {
  const buffer = await generarPDFBuffer(datos);
  const nombre = `${(datos.nombreVendedor || 'factura').replace(/[^a-zA-Z0-9]/g, '_')}_${datos.numeroFactura || 'sin_num'}.pdf`.slice(0, 80);
  await sock.sendMessage(jid, { document: buffer, fileName: nombre, mimetype: 'application/pdf' });
}

async function enviarASistema(datos) {
  const res = await fetch(`${BACKEND_URL}/guardar-compartido`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...datos, sucursal: 'WhatsApp', fechaEnvio: new Date().toISOString() }),
  });
  return res.ok;
}

async function enviarALocal(datos) {
  if (!IP_LOCAL_URL) return false;
  const res = await fetch(`${IP_LOCAL_URL}/guardar-compartido`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...datos, sucursal: 'WhatsApp', fechaEnvio: new Date().toISOString() }),
  });
  return res.ok;
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const SUPABASE_TABLE = 'auth';

async function supabaseGuardar(data) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    // fallback: guardar en el backend
    const res = await fetch(`${BACKEND_URL}/auth-guardar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth: data }),
    });
    return res.ok;
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ id: 1, data }),
  });
  return res.ok;
}

async function supabaseCargar() {
  if (SUPABASE_URL && SUPABASE_KEY) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=eq.1&select=data`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    });
    if (res.ok) {
      const rows = await res.json();
      if (rows && rows.length > 0 && rows[0].data) return rows[0].data;
    }
  }
  // fallback: cargar del backend
  const res = await fetch(`${BACKEND_URL}/auth-cargar`);
  const data = await res.json();
  if (data.status === 'ok' && data.auth) return data.auth;
  return null;
}

async function cargarAuthRemoto() {
  try {
    const authStr = await supabaseCargar();
    if (!authStr) return false;
    const archivos = JSON.parse(authStr);
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
    for (const [nombre, contenido] of Object.entries(archivos)) {
      fs.writeFileSync(path.join(AUTH_DIR, nombre), Buffer.from(contenido, 'base64'));
    }
    console.log('Auth cargado de Supabase/backend');
    return true;
  } catch (e) {
    console.log('No hay auth remoto:', e.message);
  }
  return false;
}

async function guardarAuthRemoto() {
  try {
    if (!fs.existsSync(AUTH_DIR)) return;
    const archivos = {};
    for (const f of fs.readdirSync(AUTH_DIR)) {
      archivos[f] = fs.readFileSync(path.join(AUTH_DIR, f)).toString('base64');
    }
    const ok = await supabaseGuardar(JSON.stringify(archivos));
    console.log(ok ? 'Auth guardado en Supabase' : 'Error guardando auth');
  } catch (e) {
    console.log('Error guardando auth remoto:', e.message);
  }
}

async function obtenerEstadisticas() {
  const res = await fetch(`${BACKEND_URL}/listar/WhatsApp`);
  const { archivos = [] } = await res.json();
  if (archivos.length === 0) return { total: 0, cantidad: 0, facturas: [] };

  const facturas = [];
  for (const nombre of archivos) {
    try {
      const r = await fetch(`${BACKEND_URL}/descargar/WhatsApp/${encodeURIComponent(nombre)}`);
      const datos = await r.json();
      facturas.push(datos);
    } catch {}
  }

  let totalGeneral = 0;
  let maxMonto = 0;
  let facturaMax = null;
  const porVendedor = {};

  for (const f of facturas) {
    const monto = Number(f.totalGeneral || 0);
    totalGeneral += monto;
    if (monto > maxMonto) { maxMonto = monto; facturaMax = f; }
    const v = f.nombreVendedor || 'Desconocido';
    porVendedor[v] = (porVendedor[v] || 0) + monto;
  }

  return {
    cantidad: facturas.length,
    total: totalGeneral,
    promedio: facturas.length ? Math.round(totalGeneral / facturas.length) : 0,
    maxMonto,
    facturaMax,
    porVendedor,
    facturas,
  };
}

async function verificarAlertasPrecio(items) {
  if (!items || items.length === 0) return [];
  const res = await fetch(`${BACKEND_URL}/listar/WhatsApp`);
  const { archivos = [] } = await res.json();
  if (archivos.length === 0) return [];

  const historial = {};
  for (const nombre of archivos.slice(-20)) {
    try {
      const r = await fetch(`${BACKEND_URL}/descargar/WhatsApp/${encodeURIComponent(nombre)}`);
      const datos = await r.json();
      if (datos.items) for (const it of datos.items) {
        const key = (it.descripcion || '').toLowerCase().trim();
        if (key && it.precio_unitario) historial[key] = Number(it.precio_unitario);
      }
    } catch {}
  }

  const alertas = [];
  for (const it of items) {
    const key = (it.descripcion || '').toLowerCase().trim();
    if (key && historial[key] && historial[key] !== Number(it.precio_unitario)) {
      alertas.push(`${it.descripcion}: antes ${Number(historial[key]).toLocaleString()} Gs, ahora ${Number(it.precio_unitario).toLocaleString()} Gs`);
    }
  }
  return alertas;
}

async function iniciarBot() {
  await cargarAuthRemoto();
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLink: true,
  });

  sock.ev.on('creds.update', saveCreds);

  const origSend = sock.sendMessage.bind(sock);
  sock.sendMessage = (...args) => origSend(...args).then(r => { if (r?.key?.id) sentIds.add(r.key.id); return r; });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    const msg = messages[0];
    if (!msg.key || sentIds.has(msg.key.id) || type !== 'notify') return;

    const jid = msg.key.remoteJid;
    const caption = msg.message?.imageMessage?.caption || '';
    const texto = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || caption || '').trim();
    const lower = texto.toLowerCase();

    const activo = usuarios[jid] && usuarios[jid].activo;
    const esperandoUser = usuarios[jid] && usuarios[jid].esperandoUsuario;

    // Inactive: only respond to activation keywords
    if (!activo && !esperandoUser) {
      if (/^(hola bot|che bot|activate|empecemos|quiero escanear)\b/i.test(lower)) {
        usuarios[jid] = { esperandoUsuario: true };
        await sock.sendMessage(jid, { text: 'Che, decime tu usuario (sucursal) para activar el bot.' });
        return;
      }
      const gpt = await interpretarGPT(texto, { estado: 'inactivo' }, jid);
      if (gpt?.intent === 'ACTIVATE') {
        usuarios[jid] = { esperandoUsuario: true };
        await sock.sendMessage(jid, { text: gpt.respuesta || 'Decime tu usuario (sucursal) para activar el bot.' });
      }
      return;
    }

    if (esperandoUser) {
      if (/^(chau|gracias|adios?)\s*(bot)?$/.test(lower) || lower === 'terminamos') {
        delete usuarios[jid];
        await sock.sendMessage(jid, { text: 'Bueno, cuando quieras activar decime nomas.' });
        return;
      }
      const encontrada = SUCURSALES_VALIDAS.find(s => s.toLowerCase() === lower);
      if (encontrada) {
        usuarios[jid] = { activo: true, sucursal: encontrada };
        const gpt = await interpretarGPT(texto, { estado: 'esperando_usuario', username: encontrada }, jid);
        await sock.sendMessage(jid, { text: gpt?.respuesta || `Usuario ${encontrada} reconocido. Bot activado. Mandame la foto de la factura.` });
      } else {
        const gpt = await interpretarGPT(texto, { estado: 'esperando_usuario' }, jid);
        if (gpt?.intent === 'SET_USERNAME' && gpt.username) {
          usuarios[jid] = { activo: true, sucursal: gpt.username };
          await sock.sendMessage(jid, { text: gpt.respuesta || `Usuario ${gpt.username} reconocido. Bot activado.` });
        } else {
          await sock.sendMessage(jid, { text: gpt?.respuesta || 'Usuario no existe.' });
        }
      }
      return;
    }

    if (activo && (/^(chau|gracias|adios?)\s*(bot)?$/.test(lower) || lower === 'terminamos')) {
      const gpt = await interpretarGPT(texto, { estado: 'activo' }, jid);
      delete usuarios[jid];
      await sock.sendMessage(jid, { text: gpt?.respuesta || 'Bot desactivado.' });
      return;
    }

    // Re-activate options for any natural request when datos exist but pendiente is off
    if (usuarios[jid] && usuarios[jid].datos && !usuarios[jid].pendiente && texto) {
      const gpt = await interpretarGPT(texto, { estado: 'activo_con_datos', tieneDatos: true }, jid);
      if (gpt && ['SHOW_DETAIL','GET_JSON','GET_PDF','SEND_TO_SYSTEM','SEND_TO_LOCAL'].includes(gpt.intent)) {
        usuarios[jid].pendiente = true;
      }
    }

    if (!activo) return;

    if (msg.message?.imageMessage) {
      await sock.sendMessage(jid, { text: 'Dale, dejame ver...' });

      try {
        const buffer = await descargarImagen(msg);
        const datos = await procesarFactura(buffer);

        if (!datos || datos.error) {
          await sock.sendMessage(jid, { text: `Algo salio mal: ${datos?.error || 'no se pudieron extraer datos'}` });
          return;
        }

        usuarios[jid] = { ...usuarios[jid], datos, pendiente: true };
        await sock.sendMessage(jid, { text: formatearResultado(datos) });
      } catch (e) {
        await sock.sendMessage(jid, { text: `Upa, algo salio mal: ${e.message}` });
      }
      return;
    }

    // Options: handle both numbers and natural language
    if (usuarios[jid] && usuarios[jid].pendiente && texto) {
      const datos = usuarios[jid].datos;
      let opcion = parseInt(texto);
      let gptResponse = null;

      if (!/^[1-5]$/.test(texto)) {
        const gpt = await interpretarGPT(texto, { estado: 'opciones', tieneDatos: true }, jid);
        if (gpt && ['SHOW_DETAIL','GET_JSON','GET_PDF','SEND_TO_SYSTEM','SEND_TO_LOCAL'].includes(gpt.intent)) {
          opcion = { SHOW_DETAIL: 1, GET_JSON: 2, GET_PDF: 3, SEND_TO_SYSTEM: 4, SEND_TO_LOCAL: 5 }[gpt.intent];
          gptResponse = gpt.respuesta;
        }
      }

      if (!opcion || opcion < 1 || opcion > 5) return;

      if (!gptResponse) await sock.sendMessage(jid, { text: 'Dame un segundo...' });

      try {
        switch (opcion) {
          case 1:
            await sock.sendMessage(jid, { text: gptResponse || formatearDetalle(datos) });
            break;
          case 2:
            await enviarJSON(sock, jid, datos);
            const jsonStr = JSON.stringify(datos, null, 2);
            const jsonTruncado = jsonStr.length > 4000 ? jsonStr.slice(0, 4000) + '\n...' : jsonStr;
            await sock.sendMessage(jid, { text: gptResponse || `JSON:\n\`\`\`\n${jsonTruncado}\n\`\`\`` });
            break;
          case 3:
            await enviarPDF(sock, jid, datos);
            if (gptResponse) await sock.sendMessage(jid, { text: gptResponse });
            break;
          case 4:
            const ok = await enviarASistema(datos);
            await sock.sendMessage(jid, { text: gptResponse || (ok ? 'Listo, ya quedo guardado en el sistema.' : 'No se pudo guardar, fijate si el sistema esta bien.') });
            delete usuarios[jid].pendiente;
            const alertas4 = await verificarAlertasPrecio(datos.items);
            if (alertas4.length > 0) {
              await sock.sendMessage(jid, { text: 'Ojo, algunos precios cambiaron respecto a facturas anteriores:\n' + alertas4.join('\n') });
            }
            break;
          case 5:
            if (!IP_LOCAL_URL) {
              await sock.sendMessage(jid, { text: 'No hay URL local configurada.' });
            } else {
              const lok = await enviarALocal(datos);
              await sock.sendMessage(jid, { text: gptResponse || (lok ? 'Enviado a carpeta compartida.' : 'No se pudo enviar a la carpeta compartida.') });
            }
            delete usuarios[jid].pendiente;
            const alertas5 = await verificarAlertasPrecio(datos.items);
            if (alertas5.length > 0) {
              await sock.sendMessage(jid, { text: 'Ojo, algunos precios cambiaron respecto a facturas anteriores:\n' + alertas5.join('\n') });
            }
            break;
        }
      } catch (e) {
        await sock.sendMessage(jid, { text: `Upa, error: ${e.message}` });
      }
      return;
    }

    // Stats / historial queries + fallback for active users
    if (activo && texto) {
      const gpt = await interpretarGPT(texto, { estado: 'activo', puedeConsultarStats: true }, jid);
      if (gpt?.intent === 'STATS') {
        await sock.sendMessage(jid, { text: 'Dame un segundo, voy a buscar...' });
        try {
          const stats = await obtenerEstadisticas();
          if (stats.cantidad === 0) {
            await sock.sendMessage(jid, { text: 'Todavia no hay facturas guardadas en el sistema.' });
          } else {
            const topVendedores = Object.entries(stats.porVendedor)
              .sort((a, b) => b[1] - a[1]).slice(0, 3)
              .map(([v, t]) => `${v}: ${Number(t).toLocaleString()} Gs`).join('\n');
            const msg = `Tenes ${stats.cantidad} facturas guardadas.\nTotal acumulado: ${stats.total.toLocaleString()} Gs\nPromedio por factura: ${stats.promedio.toLocaleString()} Gs\n\nTop vendedores:\n${topVendedores}`;
            await sock.sendMessage(jid, { text: gpt.respuesta || msg });
          }
        } catch (e) {
          await sock.sendMessage(jid, { text: `No pude consultar las estadisticas: ${e.message}` });
        }
        return;
      }

      // Fallback: si GPT respondió algo (CHAT, etc.) y no entró en ningún otro handler
      if (gpt?.respuesta) {
        await sock.sendMessage(jid, { text: gpt.respuesta });
        return;
      }
    }
  });

  sock.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => {
    if (qr) {
      ultimoQR = qr;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qr)}`;
      console.log('🔐 Escaneá el QR en:');
      console.log(`   https://whatsapp-facturas-bot.onrender.com/qr`);
      console.log(`   O directo: ${qrUrl}`);
      console.log('   (También en http://localhost:' + PORT + '/qr si estás en local)');
      estadoConexion = 'conectando';
    }
    if (connection === 'open') {
      console.log('✅ Bot conectado a WhatsApp');
      estadoConexion = 'conectado';
      ultimoQR = null;
      guardarAuthRemoto();
    }
    if (connection === 'close') {
      console.log('❌ Conexión cerrada, reconectando en 5s...');
      estadoConexion = 'desconectado';
      setTimeout(iniciarBot, 5000);
    }
  });
}

iniciarBot();
