const http = require('http');
const { default: makeWASocket, useMultiFileAuthState, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'https://scanner-facturas-backend.onrender.com';
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
  texto += `4 - Enviar al sistema\n\n`;
  texto += `Mandame el número nomas.`;
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
    if (it.codigo) texto += ` (${it.codigo})`;
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
      doc.text('CODIGO', 50, y + 6, { width: 100 });
      doc.text('DESCRIPCION', 120, y + 6, { width: 180 });
      doc.text('CANT', 310, y + 6, { width: 40 });
      doc.text('PRECIO', 360, y + 6, { width: 80 });
      doc.text('SUBTOTAL', 440, y + 6, { width: 100 });
      y += 22;

      doc.fill('#000000').fontSize(9).font('Helvetica');
      datos.items.forEach((it, i) => {
        if (i % 2 === 0) doc.rect(40, y, doc.page.width - 80, 20).fill('#f0f0f0');
        doc.fill('#000000');
        doc.text(it.codigo || it.codigo_barras || '-', 50, y + 4, { width: 70 });
        doc.text((it.descripcion || '?').slice(0, 35), 120, y + 4, { width: 180 });
        doc.text((it.cantidad || 1).toString(), 310, y + 4, { width: 40 });
        doc.text(Number(it.precio_unitario || 0).toLocaleString(), 360, y + 4, { width: 80 });
        doc.text(Number(it.subtotal || 0).toLocaleString(), 440, y + 4, { width: 100 });
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

    const SUCURSALES_VALIDAS = ["Minimarket LF", "Local 1"];

    const activo = usuarios[jid] && usuarios[jid].activo;
    const esperandoUser = usuarios[jid] && usuarios[jid].esperandoUsuario;

    if (lower === 'hola bot' && !activo && !esperandoUser) {
      usuarios[jid] = { esperandoUsuario: true };
      await sock.sendMessage(jid, { text: 'Decime tu usuario (sucursal) para activar el bot.' });
      return;
    }

    if (esperandoUser) {
      const encontrada = SUCURSALES_VALIDAS.find(s => s.toLowerCase() === lower);
      if (encontrada) {
        usuarios[jid] = { activo: true, sucursal: encontrada };
        await sock.sendMessage(jid, { text: `Usuario ${encontrada} reconocido. Bot activado. Mandame la foto de la factura.` });
      } else {
        await sock.sendMessage(jid, { text: `Usuario no reconocido. Los validos son: ${SUCURSALES_VALIDAS.join(', ')}` });
      }
      return;
    }

    if (lower === 'chau bot') {
      delete usuarios[jid];
      await sock.sendMessage(jid, { text: 'Bot desactivado.' });
      return;
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

    if (usuarios[jid] && usuarios[jid].pendiente && /^[1-4]$/.test(texto)) {
      const datos = usuarios[jid].datos;
      const opcion = parseInt(texto);

      await sock.sendMessage(jid, { text: 'Dame un segundo...' });

      try {
        switch (opcion) {
          case 1:
            await sock.sendMessage(jid, { text: formatearDetalle(datos) });
            break;
          case 2:
            await enviarJSON(sock, jid, datos);
            const jsonStr = JSON.stringify(datos, null, 2);
            const jsonTruncado = jsonStr.length > 4000 ? jsonStr.slice(0, 4000) + '\n...' : jsonStr;
            await sock.sendMessage(jid, { text: `JSON:\n\`\`\`\n${jsonTruncado}\n\`\`\`` });
            break;
          case 3:
            await enviarPDF(sock, jid, datos);
            await sock.sendMessage(jid, { text: 'Ahi va el PDF.' });
            break;
          case 4:
            const ok = await enviarASistema(datos);
            await sock.sendMessage(jid, { text: ok ? 'Listo, ya quedo guardado en el sistema.' : 'No se pudo guardar, fijate si el sistema esta bien.' });
            break;
        }
      } catch (e) {
        await sock.sendMessage(jid, { text: `Upa, error: ${e.message}` });
      }

      delete usuarios[jid].pendiente;
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
