// URL por defecto del servidor backend (Render)
const DEFAULT_URL = "https://scanner-facturas-backend.onrender.com";

// Función con retry automático (reintenta 2 veces si falla)
async function fetchConRetry(url, options = {}, reintentos = 2) {
  for (let intento = 0; intento <= reintentos; intento++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        if (intento < reintentos) {
          await new Promise(r => setTimeout(r, 1500 * (intento + 1)));
          continue;
        }
        throw new Error(`Error del servidor: ${res.status}`);
      }
      return await res.json();
    } catch (error) {
      if (intento < reintentos && (error.message.includes('Network') || error.message.includes('timeout') || error.message.includes('fetch'))) {
        await new Promise(r => setTimeout(r, 1500 * (intento + 1)));
        continue;
      }
      throw error;
    }
  }
}

// Envía fotos al servidor para procesar con IA (OCR) y extraer datos de la factura
export async function procesarFactura(fotos, sucursalActual, urlServidor = DEFAULT_URL) {
  const formData = new FormData();
  for (let i = 0; i < fotos.length; i++) {
    formData.append('factura', {
      uri: fotos[i],
      name: `factura_${i}.jpg`,
      type: 'image/jpeg',
    });
  }
  formData.append('sucursal', sucursalActual);

  return fetchConRetry(`${urlServidor}/procesar`, {
    method: 'POST',
    body: formData,
    headers: { 'Accept': 'application/json' },
  });
}

// Procesa un código QR de factura electrónica (SIFEN/KUDE) a través del servidor
export async function procesarQr(qrContent, sucursalActual, urlServidor = DEFAULT_URL) {
  return fetchConRetry(`${urlServidor}/procesar-qr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qr: qrContent, sucursal: sucursalActual }),
  });
}

// Procesa el HTML completo (o datos DE) extraídos de SIFEN vía CaptchaWebView
export async function procesarHtmlCompleto(data, urlServidor = DEFAULT_URL) {
  return fetchConRetry(`${urlServidor}/procesar-html-completo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// Guarda la factura en el buzón del servidor (Visor Web / Dashboard)
export async function guardarEnServidor(datosFactura, sucursalActual, urlServidor = DEFAULT_URL) {
  const datosConSucursal = {
    ...datosFactura,
    sucursal: sucursalActual,
    fechaEnvio: new Date().toISOString(),
  };
  return fetchConRetry(`${urlServidor}/guardar-compartido`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(datosConSucursal),
  });
}

// Guarda la factura en el servidor local de la red (192.168.100.100)
export async function guardarEnCarpeta(datosFactura, sucursalActual) {
  const datosConSucursal = {
    ...datosFactura,
    sucursal: sucursalActual,
    fechaEnvio: new Date().toISOString(),
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`http://192.168.100.100:10000/guardar-compartido`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(datosConSucursal),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Error ${res.status}`);
    return await res.json();
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

// Busca un producto por código en el historial de facturas del servidor
export async function buscarProducto(codigo, urlServidor = DEFAULT_URL) {
  return fetchConRetry(`${urlServidor}/buscar-producto/${encodeURIComponent(codigo)}`);
}

// Obtiene la lista de facturas de una sucursal desde el servidor
export async function obtenerHistorial(sucursal, urlServidor = DEFAULT_URL) {
  return fetchConRetry(`${urlServidor}/historial/${encodeURIComponent(sucursal)}`);
}
