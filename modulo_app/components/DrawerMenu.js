import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Linking, Platform, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../utils/ThemeContext';
import { guardarNgrokUrl, cargarNgrokUrl, esPasswordValida } from '../utils/storage';

// Drawer lateral: historial, filtros, total acumulado y acciones
export default function DrawerMenu({
  visible, onClose, sucursalActual, calculoTotal, historialFiltrado, totalFacturas,
  busqueda, onChangeBusqueda, fechaDesde, fechaHasta,
  onChangeFechaDesde, onChangeFechaHasta,
  onBorrarHistorial, onCambiarSucursal,
  onSincronizar, onThemeToggle, onEliminarFactura, onExpandirFactura,
  sincronizando,
}) {
  const { theme, isDark } = useTheme();
  const [itemExpandido, setItemExpandido] = useState(null);
  const [showPicker, setShowPicker] = useState(null);
  const [ngrokInput, setNgrokInput] = useState('');
  const [ngrokSaved, setNgrokSaved] = useState(false);
  const [ngrokDesbloqueado, setNgrokDesbloqueado] = useState(false);

  useEffect(() => { cargarNgrokUrl().then(u => { if (u) setNgrokInput(u); }); }, []);

  const guardarNgrok = async () => {
    const url = ngrokInput.trim();
    await guardarNgrokUrl(url);
    setNgrokSaved(true);
    setTimeout(() => setNgrokSaved(false), 2000);
  };

  const pedirPasswordNgrok = () => {
    Alert.prompt(
      'Contraseña',
      'Ingresá la contraseña para configurar la dirección',
      (text) => {
        if (esPasswordValida(text)) {
          setNgrokDesbloqueado(true);
        } else {
          Alert.alert('Incorrecta', 'Contraseña incorrecta');
        }
      },
      'secure-text'
    );
  };

  // Convierte YYYY-MM-DD a DD/MM/YYYY para mostrar
  const formatearFecha = (str) => {
    if (!str) return '';
    const partes = str.split('-');
    if (partes.length !== 3) return str;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  };

  // Maneja la selección de fecha en el DateTimePicker nativo
  const handleDateChange = (event, selectedDate) => {
    setShowPicker(null);
    if (event.type === 'dismissed') return;
    const d = selectedDate || new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const fechaStr = `${yyyy}-${mm}-${dd}`;
    if (showPicker === 'desde') onChangeFechaDesde(fechaStr);
    else onChangeFechaHasta(fechaStr);
  };

  // Tocar un filtro activo lo limpia; tocar uno vacío abre el picker
  const abrirPicker = (tipo) => {
    const valor = tipo === 'desde' ? fechaDesde : fechaHasta;
    if (valor) {
      if (tipo === 'desde') onChangeFechaDesde('');
      else onChangeFechaHasta('');
      return;
    }
    setShowPicker(tipo);
  };

  // Convierte string YYYY-MM-DD a Date para el DateTimePicker
  const getDateValue = (str) => {
    if (!str) return new Date();
    const partes = str.split('-');
    return new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
  };

  if (!visible) return null;

  // Expande/contrae los detalles de una factura
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
      {/* Capa oscura detrás del drawer */}
      <TouchableOpacity style={styles.capaOscura} onPress={onClose} activeOpacity={1} />
      <View style={[styles.drawer, { backgroundColor: theme.drawerBg }]}>
        {/* Encabezado del drawer: tema, título, cerrar */}
        <View style={styles.drawerTop}>
          <TouchableOpacity onPress={onThemeToggle}>
            <Text style={[{ fontSize: 22 }]}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
          <Text style={[styles.drawerTitle, { color: theme.primary }]}>R21</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.drawerClose, { color: theme.textSecondary }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Total acumulado de la sucursal */}
        <View style={[styles.resumen, { backgroundColor: theme.background, borderColor: theme.primary }]}>
          <Text style={[styles.resumenLabel, { color: theme.primary }]}>TOTAL ACUMULADO</Text>
          <Text style={[styles.resumenMonto, { color: theme.text }]}>
            {calculoTotal.toLocaleString('es-PY')} Gs.
          </Text>
          <Text style={[styles.resumenSub, { color: theme.textMuted }]}>{totalFacturas} facturas{historialFiltrado.length !== totalFacturas ? ` (${historialFiltrado.length} filtradas)` : ''}</Text>
        </View>

        {/* Botones de acción rápida */}
        <View style={styles.acciones}>
          <TouchableOpacity style={[styles.accionBtn, { backgroundColor: theme.danger }]} onPress={onBorrarHistorial}>
            <Text style={styles.accionText}>Borrar historial</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.accionBtn, { backgroundColor: theme.surface }]} onPress={onCambiarSucursal}>
            <Text style={[styles.accionText, { color: theme.text }]}>Cambiar sucursal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.accionBtn, { backgroundColor: theme.surface }]} onPress={() => Linking.openURL("https://wa.me/595981644728")}>
            <Text style={[styles.accionText, { color: theme.text }]}>Soporte</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.accionBtn, { backgroundColor: theme.surface }]} onPress={onSincronizar} disabled={sincronizando}>
            {sincronizando ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Text style={[styles.accionText, { color: theme.primary }]}>Sincronizar</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Campo de búsqueda */}
        <TextInput
          style={[styles.search, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
          placeholder="Buscar factura..."
          placeholderTextColor={theme.textMuted}
          value={busqueda}
          onChangeText={onChangeBusqueda}
        />

        {/* Filtros de fecha: Desde / Hasta */}
        <View style={styles.fechaRow}>
          <TouchableOpacity
            style={[styles.fechaBtn, { backgroundColor: theme.background, borderColor: fechaDesde ? theme.primary : theme.border }]}
            onPress={() => abrirPicker('desde')}
          >
            <Text style={[styles.fechaLabel, { color: theme.textMuted }]}>Desde</Text>
            <Text style={[styles.fechaValor, { color: fechaDesde ? theme.text : theme.textMuted }]}>
              {fechaDesde ? formatearFecha(fechaDesde) : 'Tocar para elegir'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.fechaSep, { color: theme.textMuted }]}>→</Text>
          <TouchableOpacity
            style={[styles.fechaBtn, { backgroundColor: theme.background, borderColor: fechaHasta ? theme.primary : theme.border }]}
            onPress={() => abrirPicker('hasta')}
          >
            <Text style={[styles.fechaLabel, { color: theme.textMuted }]}>Hasta</Text>
            <Text style={[styles.fechaValor, { color: fechaHasta ? theme.text : theme.textMuted }]}>
              {fechaHasta ? formatearFecha(fechaHasta) : 'Tocar para elegir'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* DateTimePicker nativo (Android/iOS) */}
        {showPicker && (
          <DateTimePicker
            value={getDateValue(showPicker === 'desde' ? fechaDesde : fechaHasta)}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
            themeVariant={isDark ? 'dark' : 'light'}
          />
        )}

        {/* Lista scrolleable de facturas filtradas */}
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {historialFiltrado.length > 0 ? (
            historialFiltrado.map((item) => (
              <View key={item.id}>
                <TouchableOpacity style={[styles.item, { backgroundColor: theme.background, borderLeftColor: theme.primary }]} onPress={() => toggleExpandir(item)} activeOpacity={0.7}>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemEmpresa, { color: theme.text }]} numberOfLines={1}>{item.empresa}</Text>
                    <Text style={[styles.itemDetalle, { color: theme.textMuted }]}>N° {item.numero} · {item.fechaEscaneo}</Text>
                  </View>
                  <View style={styles.itemRight}>
                    <Text style={[styles.itemMonto, { color: theme.primary }]}>
                      {Number(item.monto).toLocaleString('es-PY')}
                    </Text>
                    {/* Botón para eliminar esta factura individual */}
                    <TouchableOpacity style={styles.itemDel} onPress={() => { if (onEliminarFactura) onEliminarFactura(item.id); }}>
                      <Text style={[styles.itemDelIcon, { color: theme.danger }]}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
                {/* Detalles expandidos de la factura (artículos) */}
                {itemExpandido === item.id && item.detalles && (
                  <View style={[styles.expandido, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    {item.detalles.items && item.detalles.items.length > 0 ? (
                      item.detalles.items.map((det, j) => (
                        <View key={j} style={styles.expRow}>
                          <Text style={[styles.expDesc, { color: theme.text }]} numberOfLines={1}>{det.descripcion || ''}</Text>
                          <Text style={[styles.expPrecio, { color: theme.primary }]}>{(det.subtotal || 0).toLocaleString('es-PY')}</Text>
        </View>

        {/* Configuración ngrok - protegido con contraseña */}
        <TouchableOpacity
          style={{ marginBottom: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, alignItems: 'center' }}
          onPress={ngrokDesbloqueado ? null : pedirPasswordNgrok}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: ngrokDesbloqueado ? theme.success : theme.textMuted, letterSpacing: 1 }}>
            {ngrokDesbloqueado ? 'NGROK (Backend Local)' : '🔒 Configurar dirección'}
          </Text>
        </TouchableOpacity>
        {ngrokDesbloqueado && (
          <View style={{ marginBottom: 16, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.success, backgroundColor: theme.surface }}>
            <TextInput
              style={[styles.search, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
              placeholder="https://xxxx.ngrok-free.app"
              placeholderTextColor={theme.textMuted}
              value={ngrokInput}
              onChangeText={setNgrokInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={[styles.accionBtn, { backgroundColor: ngrokSaved ? theme.success : theme.primary, width: '100%', alignItems: 'center' }]} onPress={guardarNgrok}>
              <Text style={styles.accionText}>{ngrokSaved ? 'Guardado!' : 'Guardar URL'}</Text>
            </TouchableOpacity>
          </View>
        )}
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
            // Mensaje cuando no hay resultados (filtros activos sin coincidencias)
            <Text style={[styles.vacio, { color: theme.textMuted }]}>
              {busqueda || fechaDesde || fechaHasta ? "Sin resultados" : "Usá el buscador o filtrá por fecha"}
            </Text>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  capaOscura: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 99 },
  drawer: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '82%', zIndex: 100, padding: 24, paddingTop: 54, elevation: 20, shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.3, shadowRadius: 20 },
  drawerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  drawerTitle: { fontSize: 28, fontWeight: '800', letterSpacing: 6 },
  drawerClose: { fontSize: 20, fontWeight: '600' },
  resumen: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  resumenLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  resumenMonto: { fontSize: 24, fontWeight: '800', marginBottom: 2 },
  resumenSub: { fontSize: 13 },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  accionBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4 },
  accionText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  search: { borderWidth: 1, padding: 12, borderRadius: 12, fontSize: 14, marginBottom: 10 },
  fechaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  fechaBtn: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 10, alignItems: 'center' },
  fechaLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
  fechaValor: { fontSize: 13, fontWeight: '600' },
  fechaSep: { fontSize: 16, fontWeight: '600' },
  scroll: { maxHeight: 320 },
  item: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, borderLeftWidth: 3, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
  itemInfo: { flex: 1 },
  itemEmpresa: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  itemDetalle: { fontSize: 12 },
  itemRight: { alignItems: 'flex-end', justifyContent: 'center', gap: 4, marginLeft: 8 },
  itemMonto: { fontSize: 14, fontWeight: '700' },
  itemDel: { padding: 4 },
  itemDelIcon: { fontSize: 14, fontWeight: 'bold' },
  vacio: { textAlign: 'center', fontSize: 14, marginTop: 24 },
  expandido: { padding: 12, borderRadius: 12, marginBottom: 6, marginLeft: 12, borderWidth: 1, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  expRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  expDesc: { flex: 1, fontSize: 12, marginRight: 8 },
  expPrecio: { fontSize: 12, fontWeight: '600' },
  expVacio: { fontSize: 12, fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 },
  expTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 6, borderTopWidth: 2 },
  expTotalLabel: { fontSize: 13, fontWeight: '700' },
  expTotalMonto: { fontSize: 14, fontWeight: '700' },
});
