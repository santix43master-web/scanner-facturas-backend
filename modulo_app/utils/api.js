const DEFAULT_URL = "https://scanner-facturas-backend.onrender.com";

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

  const res = await fetch(`${urlServidor}/procesar`, {
    method: 'POST',
    body: formData,
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) throw new Error(`Error del servidor: ${res.status}`);
  return await res.json();
}

export async function procesarQr(qrContent, sucursalActual, urlServidor = DEFAULT_URL) {
  const res = await fetch(`${urlServidor}/procesar-qr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qr: qrContent, sucursal: sucursalActual }),
  });
  if (!res.ok) throw new Error(`Error del servidor: ${res.status}`);
  return await res.json();
}

export async function procesarHtmlCompleto(data, urlServidor = DEFAULT_URL) {
  const res = await fetch(`${urlServidor}/procesar-html-completo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Error del servidor: ${res.status}`);
  return await res.json();
}

export async function guardarEnServidor(datosFactura, sucursalActual, urlServidor = DEFAULT_URL) {
  const datosConSucursal = {
    ...datosFactura,
    sucursal: sucursalActual,
    fechaEnvio: new Date().toISOString(),
  };
  const res = await fetch(`${urlServidor}/guardar-compartido`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(datosConSucursal),
  });
  if (!res.ok) throw new Error(`Error del servidor: ${res.status}`);
  return await res.json();
}

export async function guardarEnCarpeta(datosFactura, sucursalActual) {
  const datosConSucursal = {
    ...datosFactura,
    sucursal: sucursalActual,
    fechaEnvio: new Date().toISOString(),
  };
  const res = await fetch(`https://snooze-chafe-bullwhip.ngrok-free.dev/guardar-compartido`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(datosConSucursal),
  });
  if (!res.ok) throw new Error(`Error del servidor local: ${res.status}`);
  return await res.json();
}

export async function buscarProducto(codigo, urlServidor = DEFAULT_URL) {
  const res = await fetch(`${urlServidor}/buscar-producto/${encodeURIComponent(codigo)}`);
  if (!res.ok) throw new Error(`Error del servidor: ${res.status}`);
  return await res.json();
}

export async function obtenerHistorial(sucursal, urlServidor = DEFAULT_URL) {
  const res = await fetch(`${urlServidor}/historial/${encodeURIComponent(sucursal)}`);
  if (!res.ok) throw new Error(`Error del servidor: ${res.status}`);
  return await res.json();
}
