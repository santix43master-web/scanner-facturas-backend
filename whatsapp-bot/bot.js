const http = require('http');
const { default: makeWASocket, useMultiFileAuthState, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || 'https://scanner-facturas-backend.onrender.com';
const AUTH_DIR = './auth_info';
const NUMERO_ACTIVADOR = (process.env.NUMERO_ACTIVADOR || '595981644723').replace(/[^0-9]/g, '');
const JID_ACTIVADOR = `${NUMERO_ACTIVADOR}@s.whatsapp.net`;

let ultimoQR = null;
let estadoConexion = 'desconectado';

const server = http.createServer((req, res) => {
  if (req.url === '/qr' && ultimoQR) {
    const qrLink = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(ultimoQR)}`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bot Facturas R21 - QR</title>
<style>body{font-family:sans-serif;text-align:center;padding:20px;background:#111;color:#fff}
h1{color:#25D366}img{max-width:90vw;border-radius:12px;box-shadow:0 0 30px rgba(37,211,102,.3)}
p{color:#aaa;margin-top:20px}.estado{display:inline-block;padding:6px 16px;border-radius:20px;font-size:14px}
.conectado{background:#25D366;color:#000}.desconectado{background:#e74c3c;color:#fff}.conectando{background:#f39c12;color:#000}
</style></head><body>
<h1>🤖 Bot Facturas R21</h1>
<p>Estado: <span class="estado ${estadoConexion}">${estadoConexion}</span></p>
${ultimoQR ? `<p>Escaneá este QR con WhatsApp:</p><img src="${qrLink}" alt="QR Code"/>` : '<p>Esperando QR...</p>'}
</body></html>`);
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: estadoConexion, qr: !!ultimoQR, bot: 'Facturas R21 WhatsApp Bot' }));
  }
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
  const b64 = buffer.toString('base64');
  const res = await fetch(`${BACKEND_URL}/procesar-json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imagen: b64, formato: 'image/jpeg' }),
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
    const doc = new PDFDocument({ margin: 30 });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    doc.fontSize(18).text('Factura', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Vendedor: ${datos.nombreVendedor || '?'}`);
    doc.text(`RUC: ${datos.rucVendedor || '?'}`);
    doc.text(`N° Factura: ${datos.numeroFactura || '?'}`);
    doc.text(`Timbrado: ${datos.timbrado || '?'}`);
    doc.text(`Fecha: ${datos.fechaEmision || '?'}`);
    if (datos.rucComprador) doc.text(`Comprador: ${datos.rucComprador}`);
    doc.moveDown();
    doc.text(`Total: ${Number(datos.totalGeneral || 0).toLocaleString()} Gs`, { bold: true });
    doc.moveDown();

    if (datos.items && datos.items.length > 0) {
      doc.text('Artículos:', { underline: true });
      doc.moveDown(0.5);
      datos.items.forEach((it) => {
        doc.text(`${it.descripcion || '?'} - ${it.cantidad || 1}x ${Number(it.precio_unitario || 0).toLocaleString()} Gs = ${Number(it.subtotal || 0).toLocaleString()} Gs`);
      });
    }

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
    if (jid !== JID_ACTIVADOR) return;

    const caption = msg.message?.imageMessage?.caption || '';
    const texto = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || caption || '').trim();
    const lower = texto.toLowerCase();

    const activo = usuarios[jid] && usuarios[jid].activo;

    if (lower === 'hola bot' && !activo) {
      usuarios[jid] = { activo: true };
      await sock.sendMessage(jid, { text: 'Bot activado. Mandame la foto de la factura.' });
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
            await sock.sendMessage(jid, { text: 'Ahi te lo mande.' });
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
