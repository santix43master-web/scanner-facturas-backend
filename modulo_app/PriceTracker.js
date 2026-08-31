import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@r21_precios_historial';
const LIMITE_DIAS = 90;

export async function actualizarPrecios(resultado) {
  try {
    if (!resultado?.items) return null;
    const historialStr = await AsyncStorage.getItem(STORAGE_KEY);
    const historial = historialStr ? JSON.parse(historialStr) : {};
    const cambios = [];
    const ahora = Date.now();

    const proveedor = resultado.nombreVendedor || 'Proveedor desconocido';

    for (const item of resultado.items) {
      const codigo = item.codigo || item.codigoBarras;
      if (!codigo) continue;

      const entradaAnterior = historial[codigo];
      const precioActual = item.precio_unitario || item.precioUnitario || 0;

      if (entradaAnterior) {
        const diff = precioActual - entradaAnterior.precio;
        const pct = entradaAnterior.precio > 0
          ? ((diff / entradaAnterior.precio) * 100).toFixed(1)
          : '0.0';
        if (Math.abs(diff) > 0) {
          cambios.push({
            codigo,
            descripcion: item.descripcion || entradaAnterior.descripcion,
            precioAnterior: entradaAnterior.precio,
            precioActual,
            diferencia: diff,
            porcentaje: pct,
            ultimaFecha: entradaAnterior.fecha,
            ultimaFactura: entradaAnterior.factura || '',
            esPrimeraVez: false,
          });
        }
      } else {
        cambios.push({
          codigo,
          descripcion: item.descripcion || '',
          precioAnterior: null,
          precioActual,
          diferencia: 0,
          porcentaje: '0.0',
          ultimaFecha: null,
          ultimaFactura: '',
          diasDesdeUltima: 0,
          esPrimeraVez: true,
        });
      }

      historial[codigo] = {
        precio: precioActual,
        descripcion: item.descripcion || entradaAnterior?.descripcion || '',
        fecha: ahora,
        factura: resultado.numeroFactura || '',
        proveedor,
      };
    }

    // Limpiar entradas viejas
    const limite = ahora - LIMITE_DIAS * 86400000;
    for (const key of Object.keys(historial)) {
      if (historial[key].fecha < limite) {
        delete historial[key];
      }
    }

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(historial));
    return cambios;
  } catch (e) {
    console.error('PriceTracker error:', e);
    return null;
  }
}

export async function limpiarHistorialPrecios() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
