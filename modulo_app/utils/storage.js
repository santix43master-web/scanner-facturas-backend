import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORIAL_KEY = '@facturas_r21';

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
    const datosOptimizados = {
      id: Date.now().toString(),
      fechaEscaneo: new Date().toLocaleDateString('es-PY'),
      sucursal: sucursalActual,
      empresa: nuevaFactura.nombreVendedor || 'Comercio Desconocido',
      rucVendedor: nuevaFactura.rucVendedor || 'Sin RUC',
      rucComprador: nuevaFactura.rucComprador || 'Sin RUC Comprador',
      numero: nuevaFactura.numeroFactura || 'Sin N°',
      monto: nuevaFactura.totalGeneral || 0,
    };
    const nuevoHistorial = [datosOptimizados, ...historial];
    await AsyncStorage.setItem(HISTORIAL_KEY, JSON.stringify(nuevoHistorial));
    return nuevoHistorial;
  } catch (error) {
    console.error("Error al guardar:", error);
    return historial;
  }
}

export async function borrarHistorialStorage() {
  await AsyncStorage.removeItem(HISTORIAL_KEY);
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
