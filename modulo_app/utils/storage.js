import AsyncStorage from '@react-native-async-storage/async-storage';

// Claves de almacenamiento local
const HISTORIAL_KEY = '@facturas_r21';       // lista resumida de facturas
const FULL_DATA_KEY = '@facturas_r21_full';  // datos completos (para vista detalle)
const PASSWORD = 'r21scann_2026';            // contraseña para borrar

// Carga la lista resumida de facturas desde el almacenamiento local
export async function cargarHistorial() {
  try {
    const datosGuardados = await AsyncStorage.getItem(HISTORIAL_KEY);
    return datosGuardados !== null ? JSON.parse(datosGuardados) : [];
  } catch (error) {
    console.error("Error al cargar historial", error);
    return [];
  }
}

// Guarda una factura nueva en el historial local (resumen + datos completos)
export async function guardarEnHistorial(historial, nuevaFactura, sucursalActual) {
  try {
    const id = Date.now().toString();
    const datosOptimizados = {
      id, fechaEscaneo: new Date().toLocaleDateString('es-PY'),
      sucursal: sucursalActual,
      empresa: nuevaFactura.nombreVendedor || 'Comercio Desconocido',
      rucVendedor: nuevaFactura.rucVendedor || 'Sin RUC',
      rucComprador: nuevaFactura.rucComprador || 'Sin RUC Comprador',
      numero: nuevaFactura.numeroFactura || 'Sin N°',
      monto: nuevaFactura.totalGeneral || 0,
    };
    const nuevoHistorial = [datosOptimizados, ...historial];
    await AsyncStorage.setItem(HISTORIAL_KEY, JSON.stringify(nuevoHistorial));
    // Guarda los datos completos (artículos, etc.) para poder expandir en el drawer
    const fullStr = await AsyncStorage.getItem(FULL_DATA_KEY);
    const full = fullStr ? JSON.parse(fullStr) : {};
    full[id] = nuevaFactura;
    await AsyncStorage.setItem(FULL_DATA_KEY, JSON.stringify(full));
    return nuevoHistorial;
  } catch (error) {
    console.error("Error al guardar:", error);
    return historial;
  }
}

// Elimina una factura del almacenamiento local y también del servidor si se proporciona urlServidor
export async function eliminarDelHistorial(id, urlServidor = null) {
  const localStr = await AsyncStorage.getItem(HISTORIAL_KEY);
  const local = localStr ? JSON.parse(localStr) : [];
  // Buscar el número de factura antes de borrar
  const item = local.find(i => i.id === id);
  const numero = item?.numero;
  const nuevo = local.filter(i => i.id !== id);
  await AsyncStorage.setItem(HISTORIAL_KEY, JSON.stringify(nuevo));
  // También elimina los datos completos asociados
  const fullStr = await AsyncStorage.getItem(FULL_DATA_KEY);
  if (fullStr) {
    const full = JSON.parse(fullStr);
    delete full[id];
    await AsyncStorage.setItem(FULL_DATA_KEY, JSON.stringify(full));
  }
  // Sincroniza la eliminación con el servidor (PostgreSQL)
  if (urlServidor && numero) {
    try {
      await fetch(`${urlServidor}/api/eliminar`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({numero}),
      });
    } catch (e) {
      console.warn("No se pudo eliminar del servidor:", e);
    }
  }
  return nuevo;
}

// Obtiene los datos completos de una factura por su id
export async function obtenerFacturaCompleta(id) {
  try {
    const fullStr = await AsyncStorage.getItem(FULL_DATA_KEY);
    if (!fullStr) return null;
    const full = JSON.parse(fullStr);
    return full[id] || null;
  } catch { return null; }
}

// Borra todo el historial local (resumen y datos completos)
export async function borrarHistorialStorage() {
  await AsyncStorage.removeItem(HISTORIAL_KEY);
  await AsyncStorage.removeItem(FULL_DATA_KEY);
}

// Guarda la sucursal seleccionada para recordarla al reiniciar la app
export async function guardarSucursal(sucursal) {
  await AsyncStorage.setItem('@sucursal_actual', sucursal);
}

// Carga la sucursal guardada
export async function cargarSucursal() {
  return await AsyncStorage.getItem('@sucursal_actual');
}

// Elimina la sucursal guardada (al cerrar sesión)
export async function borrarSucursal() {
  await AsyncStorage.removeItem('@sucursal_actual');
}

// Verifica si la contraseña ingresada es correcta
export function esPasswordValida(input) {
  return input === PASSWORD;
}

// URL del backend local (ngrok o IP directa)
const NGROK_KEY = '@ngrok_url';

export async function guardarNgrokUrl(url) {
  await AsyncStorage.setItem(NGROK_KEY, url);
}

export async function cargarNgrokUrl() {
  return await AsyncStorage.getItem(NGROK_KEY);
}
