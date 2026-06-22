import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Linking, StyleSheet } from 'react-native';
import { useTheme } from '../utils/ThemeContext';

export default function DrawerMenu({
  visible, onClose, sucursalActual, calculoTotal, historialFiltrado,
  busqueda, onChangeBusqueda, onBorrarHistorial, onCambiarSucursal,
  onSincronizar, onThemeToggle, onEliminarFactura, onExpandirFactura,
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
      <View style={[styles.drawer, { backgroundColor: theme.background }]}>
        <View style={styles.drawerTop}>
          <TouchableOpacity onPress={onThemeToggle}>
            <Text style={[styles.drawerIcon, { color: theme.textSecondary }]}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
          <Text style={[styles.drawerTitulo, { color: theme.text }]}>R21</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.drawerCerrar, { color: theme.textSecondary }]}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.resumen, { borderColor: theme.border }]}>
          <Text style={[styles.resumenMonto, { color: theme.text }]}>
            {calculoTotal.toLocaleString('es-PY')} Gs.
          </Text>
          <Text style={[styles.resumenSub, { color: theme.textSecondary }]}>{historialFiltrado.length} facturas</Text>
        </View>

        <View style={styles.acciones}>
          <TouchableOpacity onPress={onBorrarHistorial}>
            <Text style={[styles.accionText, { color: theme.danger }]}>Borrar historial</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onCambiarSucursal}>
            <Text style={[styles.accionText, { color: theme.textSecondary }]}>Cambiar sucursal</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL("https://wa.me/595981644728")}>
            <Text style={[styles.accionText, { color: theme.textSecondary }]}>Soporte</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onSincronizar}>
            <Text style={[styles.accionText, { color: theme.primary }]}>Sincronizar</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={[styles.buscador, { borderColor: theme.border, color: theme.text }]}
          placeholder="Buscar..."
          placeholderTextColor={theme.textMuted}
          value={busqueda}
          onChangeText={onChangeBusqueda}
        />

        <ScrollView style={styles.scroll}>
          {historialFiltrado.length > 0 ? (
            historialFiltrado.map((item) => (
              <View key={item.id}>
                <TouchableOpacity style={[styles.item, { borderColor: theme.border }]} onPress={() => toggleExpandir(item)} activeOpacity={0.7}>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemEmpresa, { color: theme.text }]} numberOfLines={1}>{item.empresa}</Text>
                    <Text style={[styles.itemDetalle, { color: theme.textMuted }]}>N° {item.numero} · {item.fechaEscaneo}</Text>
                  </View>
                  <View style={styles.itemRight}>
                    <Text style={[styles.itemMonto, { color: theme.primary }]}>
                      {Number(item.monto).toLocaleString('es-PY')}
                    </Text>
                    <TouchableOpacity onPress={() => { if (onEliminarFactura) onEliminarFactura(item.id); }}>
                      <Text style={[styles.itemDelete, { color: theme.textMuted }]}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
                {itemExpandido === item.id && item.detalles && (
                  <View style={[styles.expandido, { borderColor: theme.border }]}>
                    {item.detalles.items && item.detalles.items.length > 0 ? (
                      item.detalles.items.map((det, j) => (
                        <View key={j} style={styles.expRow}>
                          <Text style={[styles.expDesc, { color: theme.text }]} numberOfLines={1}>{det.descripcion || ''}</Text>
                          <Text style={[styles.expPrecio, { color: theme.primary }]}>{(det.subtotal || 0).toLocaleString('es-PY')}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={[styles.expVacio, { color: theme.textMuted }]}>Sin detalles</Text>
                    )}
                    {item.detalles.totalGeneral && (
                      <View style={[styles.expTotal, { borderTopColor: theme.primary }]}>
                        <Text style={[styles.expTotalLabel, { color: theme.text }]}>Total</Text>
                        <Text style={[styles.expTotalMonto, { color: theme.primary }]}>{(item.detalles.totalGeneral).toLocaleString('es-PY')} Gs</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            ))
          ) : (
            <Text style={[styles.vacio, { color: theme.textMuted }]}>
              {busqueda ? "Sin resultados" : "Sin facturas"}
            </Text>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  capaOscura: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 99 },
  drawer: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '82%', zIndex: 100, padding: 24, paddingTop: 56 },
  drawerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  drawerIcon: { fontSize: 20 },
  drawerTitulo: { fontSize: 24, fontWeight: '600', letterSpacing: 4 },
  drawerCerrar: { fontSize: 18 },
  resumen: { padding: 20, borderWidth: 1, marginBottom: 24 },
  resumenMonto: { fontSize: 22, fontWeight: '600', marginBottom: 4 },
  resumenSub: { fontSize: 13 },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24 },
  accionText: { fontSize: 14, fontWeight: '500' },
  buscador: { borderBottomWidth: 1, padding: 10, fontSize: 14, marginBottom: 16 },
  scroll: { maxHeight: 320 },
  item: { paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1 },
  itemInfo: { flex: 1 },
  itemEmpresa: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  itemDetalle: { fontSize: 12 },
  itemRight: { alignItems: 'flex-end', justifyContent: 'center', gap: 4 },
  itemMonto: { fontSize: 14, fontWeight: '600' },
  itemDelete: { fontSize: 12 },
  vacio: { textAlign: 'center', fontSize: 13, marginTop: 24 },
  expandido: { borderWidth: 1, padding: 12, marginBottom: 8, marginLeft: 8 },
  expRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  expDesc: { flex: 1, fontSize: 12, marginRight: 8 },
  expPrecio: { fontSize: 12, fontWeight: '600' },
  expVacio: { fontSize: 12, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  expTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 6, borderTopWidth: 2 },
  expTotalLabel: { fontSize: 13, fontWeight: '600' },
  expTotalMonto: { fontSize: 14, fontWeight: '600' },
});
