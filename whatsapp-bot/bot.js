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
const IP_LOCAL_URL = process.env.IP_LOCAL_URL || '';
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

async function interpretarGPT(mensaje, contexto) {
  if (!openai) return null;
  const prompt = `Eres un asistente de facturación en WhatsApp del sistema Facturas R21. Ayudas a procesar fotos de facturas.

Contexto: ${JSON.stringify(contexto)}

Respondé SOLO con un JSON sin markdown:
{
  "intent": "SET_USERNAME | SHOW_DETAIL | GET_JSON | GET_PDF | SEND_TO_SYSTEM | SEND_TO_LOCAL | DEACTIVATE | CHAT | ACTIVATE | UNKNOWN",
  "respuesta": "tu respuesta natural en español, sin emojis",
  "username": "solo si intent SET_USERNAME"
}

Reglas:
- Hablá como persona, no robot. Natural, casual, pila
- Saludos/agradecimientos: CHAT + respuesta cordial, siempre mencioná que podes ayudar con facturas
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
- Si el usuario esta inactivo (no ha activado el bot):
  * Saludos casuales ("que tal", "hola", "como estas", "buenas") → CHAT con respuesta amigable, ofreciendo ayuda
  * Si quiere activar ("hola bot", "che bot", "quiero escanear", "activate", "empecemos") → ACTIVATE y pedí el usuario
  * Cualquier cosa que parezca que quiere usar el bot → ACTIVATE
  * Si solo saluda o pregunta como estas → CHAT, respondé natural`;

  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: mensaje }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 250,
    });
    return JSON.parse(r.choices[0].message.content);
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
  texto += `Artículos: ${(datos.items || []).length}\n\n`;
  texto += `Decime qué querés hacer:\n`;
  texto += `1 - Ver detalle completo\n`;
  texto += `2 - Bajar JSON\n`;
  texto += `3 - Bajar PDF\n`;
  texto += `4 - Enviar al sistema\n`;
  if (IP_LOCAL_URL) texto += `5 - Enviar a carpeta compartida\n`;
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
    const gris = '#f5f5f5';

    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#fafafa');

    doc.rect(0, 0, doc.page.width, 120).fill(azul);
    doc.fill('#ffffff').fontSize(28).font('Helvetica-Bold').text('FACTURA', 40, 35, { align: 'center' });
    doc.fontSize(12).font('Helvetica').text('Documento Electrónico', { align: 'center' });
    doc.fill('#ffffff').fontSize(10).text(`RUC: ${datos.rucVendedor || '---'}`, 40, 85, { align: 'center' });
    doc.fill('#000000');

    doc.rect(40, 135, doc.page.width - 80, 50).fill(gris);
    doc.fill('#000000').fontSize(10).font('Helvetica');
    doc.text(`Vendedor: ${datos.nombreVendedor || '---'}`, 50, 143);
    doc.text(`N° Factura: ${datos.numeroFactura || '---'}`, 50, 158);
    doc.text(`Timbrado: ${datos.timbrado || '---'}`, 300, 143);
    doc.text(`Fecha: ${datos.fechaEmision || '---'}`, 300, 158);

    if (datos.items && datos.items.length > 0) {
      let y = 205;
      doc.rect(40, y, doc.page.width - 80, 22).fill(azul);
      doc.fill('#ffffff').fontSize(9).font('Helvetica-Bold');
      doc.text('CODIGO', 50, y + 6, { width: 55 });
      doc.text('COD. BARRAS', 110, y + 6, { width: 65 });
      doc.text('DESCRIPCION', 180, y + 6, { width: 130 });
      doc.text('CANT', 315, y + 6, { width: 35 });
      doc.text('PRECIO', 355, y + 6, { width: 75 });
      doc.text('SUBTOTAL', 435, y + 6, { width: 80 });
      y += 22;

      doc.fill('#000000').fontSize(9).font('Helvetica');
      datos.items.forEach((it, i) => {
        if (i % 2 === 0) doc.rect(40, y, doc.page.width - 80, 20).fill('#f0f0f0');
        doc.fill('#000000');
        doc.text(it.codigo || '-', 50, y + 4, { width: 55 });
        doc.text(it.codigo_barras || '-', 110, y + 4, { width: 65 });
        doc.text((it.descripcion || '?').slice(0, 30), 180, y + 4, { width: 130 });
        doc.text((it.cantidad || 1).toString(), 315, y + 4, { width: 35 });
        doc.text(Number(it.precio_unitario || 0).toLocaleString(), 355, y + 4, { width: 75 });
        doc.text(Number(it.subtotal || 0).toLocaleString(), 435, y + 4, { width: 80 });
        y += 20;
      });

      y += 10;
      doc.rect(300, y, doc.page.width - 340, 30).fill(azul);
      doc.fill('#ffffff').fontSize(12).font('Helvetica-Bold');
      doc.text(`TOTAL: ${gs(datos.totalGeneral)}`, 310, y + 7);
    } else {
      doc.fill('#000000').fontSize(11).text('No se detectaron artículos.', 50, 210);
    }

    doc.fillColor('#999999').fontSize(8).font('Helvetica');
    doc.text('Generado por Sistema de Facturación R21', 40, doc.page.height - 40, { align: 'center' });

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

async function iniciarBot() {
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

    // Inactive: respond to anything via GPT
    if (!activo && !esperandoUser) {
      const gpt = await interpretarGPT(texto, { estado: 'inactivo' });
      if (gpt?.intent === 'ACTIVATE') {
        usuarios[jid] = { esperandoUsuario: true };
        await sock.sendMessage(jid, { text: gpt.respuesta || 'Decime tu usuario (sucursal) para activar el bot.' });
      } else if (gpt) {
        await sock.sendMessage(jid, { text: gpt.respuesta || 'Hola! Si queres escanear una factura solo decime.' });
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
        const gpt = await interpretarGPT(texto, { estado: 'esperando_usuario', username: encontrada });
        await sock.sendMessage(jid, { text: gpt?.respuesta || `Usuario ${encontrada} reconocido. Bot activado. Mandame la foto de la factura.` });
      } else {
        const gpt = await interpretarGPT(texto, { estado: 'esperando_usuario' });
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
      const gpt = await interpretarGPT(texto, { estado: 'activo' });
      delete usuarios[jid];
      await sock.sendMessage(jid, { text: gpt?.respuesta || 'Bot desactivado.' });
      return;
    }

    // Re-activate options for any natural request when datos exist but pendiente is off
    if (usuarios[jid] && usuarios[jid].datos && !usuarios[jid].pendiente && texto) {
      const gpt = await interpretarGPT(texto, { estado: 'activo_con_datos', tieneDatos: true });
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

        if (datos.error) {
          await sock.sendMessage(jid, { text: `Algo salio mal: ${datos.error}` });
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
        const gpt = await interpretarGPT(texto, { estado: 'opciones', tieneDatos: true });
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
            break;
          case 5:
            if (!IP_LOCAL_URL) {
              await sock.sendMessage(jid, { text: 'No hay URL local configurada.' });
            } else {
              const lok = await enviarALocal(datos);
              await sock.sendMessage(jid, { text: gptResponse || (lok ? 'Enviado a carpeta compartida.' : 'No se pudo enviar a la carpeta compartida.') });
            }
            delete usuarios[jid].pendiente;
            break;
        }
      } catch (e) {
        await sock.sendMessage(jid, { text: `Upa, error: ${e.message}` });
      }
      return;
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
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
      console.log(`❌ Conexión cerrada${shouldReconnect ? ', reconectando en 5s...' : ', sesión inválida.'}`);
      estadoConexion = 'desconectado';
      if (shouldReconnect) {
        setTimeout(iniciarBot, 5000);
      }
    }
  });
}

iniciarBot();
