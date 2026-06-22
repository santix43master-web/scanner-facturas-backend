import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, Linking, StyleSheet,
} from 'react-native';

export default function DrawerMenu({
  visible, onClose, sucursalActual, calculoTotal, historialFiltrado,
  busqueda, onChangeBusqueda, onBorrarHistorial, onCambiarSucursal,
  onSincronizar, cargando,
}) {
  if (!visible) return null;

  return (
    <>
      <TouchableOpacity style={styles.capaOscura} onPress={onClose} activeOpacity={1} />
      <View style={styles.drawerMenu}>
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitulo}>R21</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.drawerCerrar}>X</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.drawerResumen}>
          <Text style={styles.drawerResumenLabel}>TOTAL ACUMULADO</Text>
          <Text style={styles.drawerResumenMonto}>
            {calculoTotal.toLocaleString('es-PY')} Gs.
          </Text>
          <Text style={styles.drawerResumenSub}>{historialFiltrado.length} facturas</Text>
        </View>

        <TouchableOpacity style={styles.drawerBtnPeligro} onPress={onBorrarHistorial}>
          <Text style={styles.drawerBtnText}>Borrar Historial</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.drawerBtnSecundario} onPress={onCambiarSucursal}>
          <Text style={styles.drawerBtnTextSec}>Cambiar Sucursal</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.drawerBtnSoporte} onPress={() => Linking.openURL("https://wa.me/595981644728")}>
          <Text style={styles.drawerBtnTextSec}>Contactar Soporte</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.drawerBtnSync} onPress={onSincronizar}>
          <Text style={styles.drawerBtnTextSec}>Sincronizar Historial</Text>
        </TouchableOpacity>

        <Text style={styles.drawerSeccionTitulo}>Historial de Facturas</Text>

        <TextInput
          style={styles.drawerBuscador}
          placeholder="Buscar por vendedor, N° factura, fecha..."
          placeholderTextColor="#90A4AE"
          value={busqueda}
          onChangeText={onChangeBusqueda}
        />

        <ScrollView style={styles.drawerScroll}>
          {historialFiltrado.length > 0 ? (
            historialFiltrado.map((item) => (
              <View key={item.id} style={styles.drawerItem}>
                <View style={styles.drawerItemInfo}>
                  <Text style={styles.drawerItemEmpresa} numberOfLines={1}>{item.empresa}</Text>
                  <Text style={styles.drawerItemDetalle}>N°: {item.numero}</Text>
                  <Text style={styles.drawerItemDetalle}>{item.fechaEscaneo}</Text>
                </View>
                <Text style={styles.drawerItemMonto}>
                  {Number(item.monto).toLocaleString('es-PY')} Gs.
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.drawerVacio}>
              {busqueda ? "Sin resultados" : "Sin facturas registradas"}
            </Text>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  capaOscura: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 99,
  },
  drawerMenu: {
    position: 'absolute', top: 0, bottom: 0, left: 0, width: '82%',
    backgroundColor: '#1B2838', zIndex: 100, padding: 24, paddingTop: 50,
    elevation: 20, shadowColor: '#000', shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 20,
  },
  drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  drawerTitulo: { fontSize: 30, fontWeight: 'bold', color: '#00BCD4', letterSpacing: 4 },
  drawerCerrar: { fontSize: 22, color: '#78909C', fontWeight: 'bold' },
  drawerResumen: {
    backgroundColor: '#0D1B2A', padding: 20, borderRadius: 16, marginBottom: 22,
    borderWidth: 1, borderColor: '#00BCD4', elevation: 4,
    shadowColor: '#00BCD4', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8,
  },
  drawerResumenLabel: { color: '#00BCD4', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  drawerResumenMonto: { color: '#FFFFFF', fontSize: 24, fontWeight: 'bold', marginVertical: 4 },
  drawerResumenSub: { color: '#78909C', fontSize: 12 },
  drawerBtnPeligro: {
    backgroundColor: '#EF5350', padding: 15, borderRadius: 14, alignItems: 'center',
    marginBottom: 10, elevation: 3, shadowColor: '#EF5350',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6,
  },
  drawerBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  drawerBtnSecundario: { backgroundColor: '#37474F', padding: 15, borderRadius: 14, alignItems: 'center', marginBottom: 10 },
  drawerBtnSoporte: { backgroundColor: '#00695C', padding: 15, borderRadius: 14, alignItems: 'center', marginBottom: 22 },
  drawerBtnTextSec: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  drawerBtnSync: {
    paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, marginBottom: 8,
    backgroundColor: '#1B2838', borderWidth: 1, borderColor: '#00BCD4',
  },
  drawerSeccionTitulo: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 10, letterSpacing: 1 },
  drawerBuscador: {
    backgroundColor: '#0D1B2A', padding: 12, borderRadius: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#2A3F4F', color: '#FFFFFF',
  },
  drawerScroll: { maxHeight: 300 },
  drawerItem: {
    backgroundColor: '#0D1B2A', padding: 12, borderRadius: 10, flexDirection: 'row',
    justifyContent: 'space-between', marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#00BCD4',
  },
  drawerItemInfo: { flex: 1 },
  drawerItemEmpresa: { fontWeight: 'bold', fontSize: 14, color: '#FFFFFF' },
  drawerItemDetalle: { fontSize: 12, color: '#78909C', marginTop: 2 },
  drawerItemMonto: { fontSize: 14, fontWeight: 'bold', color: '#00BCD4', alignSelf: 'center' },
  drawerVacio: { textAlign: 'center', color: '#546E7A', fontSize: 14, marginTop: 20 },
});
