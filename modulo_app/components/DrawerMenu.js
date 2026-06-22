import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, Linking, Modal, StyleSheet,
} from 'react-native';
import { useTheme } from '../utils/ThemeContext';

export default function DrawerMenu({
  visible, onClose, sucursalActual, calculoTotal, historialFiltrado,
  busqueda, onChangeBusqueda, onBorrarHistorial, onCambiarSucursal,
  onSincronizar, cargando, onThemeToggle, onEliminarFactura, onExpandirFactura,
}) {
  const { theme, isDark } = useTheme();
  const [itemExpandido, setItemExpandido] = useState(null);

  if (!visible) return null;

  const toggleExpandir = (item) => {
    if (itemExpandido === item.id) {
      setItemExpandido(null);
    } else {
      setItemExpandido(item.id);
      if (onExpandirFactura) onExpandirFactura(item);
    }
  };

  return (
    <>
      <TouchableOpacity style={styles.capaOscura} onPress={onClose} activeOpacity={1} />
      <View style={[styles.drawerMenu, { backgroundColor: theme.drawerBackground }]}>
        <View style={styles.drawerHeader}>
          <Text style={[styles.drawerTitulo, { color: theme.primary }]}>R21</Text>
          <View style={styles.drawerHeaderBtns}>
            <TouchableOpacity onPress={onThemeToggle} style={[styles.themeToggleBtn, { backgroundColor: theme.surface }]}>
              <Text style={[styles.themeToggleIcon, { color: theme.text }]}>{isDark ? '☀️' : '🌙'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.drawerCerrar, { color: theme.textMuted }]}>X</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.drawerResumen, { backgroundColor: theme.background, borderColor: theme.primary }]}>
          <Text style={[styles.drawerResumenLabel, { color: theme.primary }]}>TOTAL ACUMULADO</Text>
          <Text style={[styles.drawerResumenMonto, { color: theme.text }]}>
            {calculoTotal.toLocaleString('es-PY')} Gs.
          </Text>
          <Text style={[styles.drawerResumenSub, { color: theme.textMuted }]}>{historialFiltrado.length} facturas</Text>
        </View>

        <TouchableOpacity style={[styles.drawerBtnPeligro, { backgroundColor: theme.danger }]} onPress={onBorrarHistorial}>
          <Text style={styles.drawerBtnText}>Borrar Historial</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.drawerBtnSecundario, { backgroundColor: theme.surface }]} onPress={onCambiarSucursal}>
          <Text style={[styles.drawerBtnTextSec, { color: theme.text }]}>Cambiar Sucursal</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.drawerBtnSoporte, { backgroundColor: theme.surface }]} onPress={() => Linking.openURL("https://wa.me/595981644728")}>
          <Text style={[styles.drawerBtnTextSec, { color: theme.text }]}>Contactar Soporte</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.drawerBtnSync, { backgroundColor: theme.surface, borderColor: theme.primary }]} onPress={onSincronizar}>
          <Text style={[styles.drawerBtnTextSec, { color: theme.primary }]}>Sincronizar Historial</Text>
        </TouchableOpacity>

        <Text style={[styles.drawerSeccionTitulo, { color: theme.text }]}>Historial de Facturas</Text>

        <TextInput
          style={[styles.drawerBuscador, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
          placeholder="Buscar por vendedor, N° factura, fecha..."
          placeholderTextColor={theme.textMuted}
          value={busqueda}
          onChangeText={onChangeBusqueda}
        />

        <ScrollView style={styles.drawerScroll}>
          {historialFiltrado.length > 0 ? (
            historialFiltrado.map((item) => (
              <View key={item.id}>
                <TouchableOpacity
                  style={[styles.drawerItem, { backgroundColor: theme.background, borderLeftColor: theme.primary }]}
                  onPress={() => toggleExpandir(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.drawerItemInfo}>
                    <Text style={[styles.drawerItemEmpresa, { color: theme.text }]} numberOfLines={1}>{item.empresa}</Text>
                    <Text style={[styles.drawerItemDetalle, { color: theme.textMuted }]}>N°: {item.numero}</Text>
                    <Text style={[styles.drawerItemDetalle, { color: theme.textMuted }]}>{item.fechaEscaneo}</Text>
                  </View>
                  <View style={styles.drawerItemRight}>
                    <Text style={[styles.drawerItemMonto, { color: theme.primary }]}>
                      {Number(item.monto).toLocaleString('es-PY')} Gs.
                    </Text>
                    <TouchableOpacity
                      style={[styles.drawerItemDelete, { backgroundColor: theme.danger + '30' }]}
                      onPress={() => { if (onEliminarFactura) onEliminarFactura(item.id); }}
                    >
                      <Text style={[styles.drawerItemDeleteIcon, { color: theme.danger }]}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
                {itemExpandido === item.id && item.detalles && (
                  <View style={[styles.drawerItemExpandido, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    {item.detalles.items && item.detalles.items.length > 0 ? (
                      item.detalles.items.map((det, j) => (
                        <View key={j} style={[styles.drawerDetRow, { borderBottomColor: theme.border }]}>
                          <Text style={[styles.drawerDetDesc, { color: theme.text }]} numberOfLines={1}>{det.descripcion || 'Producto'}</Text>
                          <Text style={[styles.drawerDetPrecio, { color: theme.primary }]}>{Number(det.subtotal || 0).toLocaleString('es-PY')} Gs</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={[styles.drawerDetVacio, { color: theme.textMuted }]}>Sin detalles disponibles</Text>
                    )}
                    {item.detalles.totalGeneral && (
                      <View style={[styles.drawerDetTotal, { borderTopColor: theme.primary }]}>
                        <Text style={[styles.drawerDetTotalLabel, { color: theme.text }]}>TOTAL</Text>
                        <Text style={[styles.drawerDetTotalMonto, { color: theme.primary }]}>{Number(item.detalles.totalGeneral).toLocaleString('es-PY')} Gs</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            ))
          ) : (
            <Text style={[styles.drawerVacio, { color: theme.textMuted }]}>
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
    zIndex: 100, padding: 24, paddingTop: 50,
    elevation: 20, shadowColor: '#000', shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 20,
  },
  drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  drawerHeaderBtns: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  themeToggleBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  themeToggleIcon: { fontSize: 18 },
  drawerTitulo: { fontSize: 30, fontWeight: 'bold', letterSpacing: 4 },
  drawerCerrar: { fontSize: 22, fontWeight: 'bold' },
  drawerResumen: {
    padding: 20, borderRadius: 16, marginBottom: 22,
    borderWidth: 1, elevation: 4,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8,
  },
  drawerResumenLabel: { fontSize: 11, fontWeight: 'bold', letterSpacing: 1 },
  drawerResumenMonto: { fontSize: 24, fontWeight: 'bold', marginVertical: 4 },
  drawerResumenSub: { fontSize: 12 },
  drawerBtnPeligro: {
    padding: 15, borderRadius: 14, alignItems: 'center',
    marginBottom: 10, elevation: 3,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6,
  },
  drawerBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  drawerBtnSecundario: { padding: 15, borderRadius: 14, alignItems: 'center', marginBottom: 10 },
  drawerBtnSoporte: { padding: 15, borderRadius: 14, alignItems: 'center', marginBottom: 22 },
  drawerBtnTextSec: { fontWeight: 'bold', fontSize: 15 },
  drawerBtnSync: {
    paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, marginBottom: 8,
    borderWidth: 1,
  },
  drawerSeccionTitulo: { fontSize: 14, fontWeight: 'bold', marginBottom: 10, letterSpacing: 1 },
  drawerBuscador: {
    padding: 12, borderRadius: 12, marginBottom: 12,
    borderWidth: 1,
  },
  drawerScroll: { maxHeight: 300 },
  drawerItem: {
    padding: 12, borderRadius: 10, flexDirection: 'row',
    justifyContent: 'space-between', marginBottom: 8, borderLeftWidth: 3,
  },
  drawerItemInfo: { flex: 1 },
  drawerItemEmpresa: { fontWeight: 'bold', fontSize: 14 },
  drawerItemDetalle: { fontSize: 12, marginTop: 2 },
  drawerItemRight: { alignItems: 'flex-end', justifyContent: 'center', gap: 6 },
  drawerItemMonto: { fontSize: 14, fontWeight: 'bold', alignSelf: 'center' },
  drawerItemDelete: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  drawerItemDeleteIcon: { fontSize: 12, fontWeight: 'bold' },
  drawerVacio: { textAlign: 'center', fontSize: 14, marginTop: 20 },
  drawerItemExpandido: {
    padding: 12, marginBottom: 8, marginLeft: 12, borderRadius: 10,
    borderWidth: 1,
  },
  drawerDetRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 4, borderBottomWidth: 1,
  },
  drawerDetDesc: { flex: 1, fontSize: 12, marginRight: 8 },
  drawerDetPrecio: { fontSize: 12, fontWeight: '600' },
  drawerDetVacio: { fontSize: 12, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  drawerDetTotal: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 8, marginTop: 6, borderTopWidth: 2,
  },
  drawerDetTotalLabel: { fontSize: 13, fontWeight: 'bold' },
  drawerDetTotalMonto: { fontSize: 15, fontWeight: 'bold' },
});
