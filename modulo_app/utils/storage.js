import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORIAL_KEY = '@facturas_r21';
const FULL_DATA_KEY = '@facturas_r21_full';
const PASSWORD = 'r21scann_2026';

export async function cargarHistorial() {
  try {
    const datosGuardados = await AsyncStorage.getItem(HISTORIAL_KEY);
    return datosGuardados !== null ? JSON.parse(datosGuardados) : [];
  } catch (error) {
    console.error("Error al cargar historial", error);
    return [];
  }
}

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
    // Guardar datos completos para vista detalle
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

export async function eliminarDelHistorial(id) {
  const localStr = await AsyncStorage.getItem(HISTORIAL_KEY);
  const local = localStr ? JSON.parse(localStr) : [];
  const nuevo = local.filter(i => i.id !== id);
  await AsyncStorage.setItem(HISTORIAL_KEY, JSON.stringify(nuevo));
  const fullStr = await AsyncStorage.getItem(FULL_DATA_KEY);
  if (fullStr) {
    const full = JSON.parse(fullStr);
    delete full[id];
    await AsyncStorage.setItem(FULL_DATA_KEY, JSON.stringify(full));
  }
  return nuevo;
}

export async function obtenerFacturaCompleta(id) {
  try {
    const fullStr = await AsyncStorage.getItem(FULL_DATA_KEY);
    if (!fullStr) return null;
    const full = JSON.parse(fullStr);
    return full[id] || null;
  } catch { return null; }
}

export async function borrarHistorialStorage() {
  await AsyncStorage.removeItem(HISTORIAL_KEY);
  await AsyncStorage.removeItem(FULL_DATA_KEY);
}

export async function guardarSucursal(sucursal) {
  await AsyncStorage.setItem('@sucursal_actual', sucursal);
}

export async function cargarSucursal() {
  return await AsyncStorage.getItem('@sucursal_actual');
}

export async function borrarSucursal() {
  await AsyncStorage.removeItem('@sucursal_actual');
}

export function esPasswordValida(input) {
  return input === PASSWORD;
}
