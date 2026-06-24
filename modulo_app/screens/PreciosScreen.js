import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, StyleSheet } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { buscarProducto } from '../utils/api';
import BarcodeScanner from '../components/BarcodeScanner';

export default function PreciosScreen({ urlServidor }) {
  const { theme } = useTheme();
  const [barcodeActivo, setBarcodeActivo] = useState(false);
  const [barcodeCargando, setBarcodeCargando] = useState(false);
  const [preciosHistorial, setPreciosHistorial] = useState([]);
  const [modalBarcodeManual, setModalBarcodeManual] = useState(false);
  const [inputBarcode, setInputBarcode] = useState('');

  const buscarPrecios = async (codigo) => {
    if (!codigo) { Alert.alert("Error", "Ingresá un código"); return; }
    setPreciosHistorial([]);
    setBarcodeCargando(true);
    try {
      const json = await buscarProducto(codigo, urlServidor);
      if (json.error) throw new Error(json.error);
      if (json.resultados && json.resultados.length > 0) {
        setPreciosHistorial(json.resultados);
      } else {
        Alert.alert("Sin resultados", `No se encontraron precios para el código ${codigo}`);
      }
    } catch (e) {
      Alert.alert("Error", `No se pudo buscar: ${e.message}`);
    } finally { setBarcodeCargando(false); }
  };

  const escanearBarcode = async (codigo) => {
    setBarcodeActivo(false);
    await buscarPrecios(codigo);
  };

  return (
    <View style={styles.menu}>
      <TouchableOpacity style={[styles.menuCard, { backgroundColor: theme.surface, borderColor: theme.success }]} onPress={() => setBarcodeActivo(true)} disabled={barcodeCargando} activeOpacity={0.85}>
        <Text style={[styles.menuIcon, { color: theme.success }]}>≡</Text>
        <Text style={[styles.menuTitle, { color: theme.text }]}>Código de barras</Text>
        <Text style={[styles.menuSub, { color: theme.textMuted }]}>Escaneá el código con la cámara</Text>
      </TouchableOpacity>

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <TouchableOpacity style={[styles.menuCard, { backgroundColor: theme.surface, borderColor: theme.accent }]} onPress={() => { setModalBarcodeManual(true); setInputBarcode(''); }} disabled={barcodeCargando} activeOpacity={0.85}>
        <Text style={[styles.menuIcon, { color: theme.accent }]}>⌨</Text>
        <Text style={[styles.menuTitle, { color: theme.text }]}>Ingresar código</Text>
        <Text style={[styles.menuSub, { color: theme.textMuted }]}>Tipeá el código de barras del producto</Text>
      </TouchableOpacity>

      {preciosHistorial.length > 0 && (
        <View style={styles.resultados}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Resultados</Text>
          {preciosHistorial.map((p, i) => (
            <View key={i} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardNum, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.cardNumText, { color: theme.totalCardText }]}>{i + 1}</Text>
                </View>
                <Text style={[styles.cardDesc, { color: theme.text }]} numberOfLines={2}>{p.descripcion || 'Producto'}</Text>
              </View>
              <View style={styles.cardTags}>
                <Text style={[styles.cardTag, { backgroundColor: theme.cardTag, color: theme.cardTagText }]}>{p.vendedor}</Text>
                <Text style={[styles.cardTag, { backgroundColor: theme.cardTag, color: theme.cardTagText }]}>{p.fecha}</Text>
              </View>
              <View style={styles.precioRow}>
                <Text style={[styles.precioValor, { color: theme.primary }]}>{Number(p.precio).toLocaleString('es-PY')} Gs.</Text>
                <Text style={[styles.precioFactura, { color: theme.textMuted }]}>Factura N° {p.factura}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {barcodeActivo && (
        <BarcodeScanner
          onBarcodeScanned={escanearBarcode}
          onCancelar={() => setBarcodeActivo(false)}
          cargando={barcodeCargando}
        />
      )}

      <Modal visible={modalBarcodeManual} transparent animationType="fade" onRequestClose={() => setModalBarcodeManual(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Buscar producto</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              placeholder="Código o código de barras"
              placeholderTextColor={theme.textMuted}
              value={inputBarcode}
              onChangeText={setInputBarcode}
              autoFocus
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.surfaceLight }]} onPress={() => setModalBarcodeManual(false)}>
                <Text style={[styles.modalBtnText, { color: theme.textSecondary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.primary }]} onPress={() => { setModalBarcodeManual(false); buscarPrecios(inputBarcode.trim()); }}>
                <Text style={[styles.modalBtnText, { color: theme.totalCardText }]}>Buscar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  menu: { width: '100%', marginTop: 10, alignItems: 'center' },
  menuCard: { width: '100%', padding: 24, borderRadius: 16, marginBottom: 10, borderWidth: 1, alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  menuIcon: { fontSize: 32, marginBottom: 8 },
  menuTitle: { fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  menuSub: { fontSize: 12, marginTop: 4, textAlign: 'center' },
  divider: { height: 1, width: '100%', marginVertical: 6 },
  resultados: { width: '100%', marginTop: 24 },
  sectionTitle: { fontSize: 20, fontWeight: '800', marginBottom: 14 },
  card: { padding: 16, borderRadius: 14, marginBottom: 8, borderWidth: 1, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  cardNum: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  cardNumText: { fontWeight: '800', fontSize: 12 },
  cardDesc: { flex: 1, fontWeight: '600', fontSize: 14 },
  cardTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 36, marginBottom: 6 },
  cardTag: { fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, fontWeight: '600' },
  precioRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginLeft: 36 },
  precioValor: { fontSize: 18, fontWeight: '700' },
  precioFactura: { fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  modalCard: { width: '100%', borderRadius: 20, padding: 28, borderWidth: 1, elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  modalInput: { borderWidth: 1, borderRadius: 14, padding: 16, fontSize: 16, marginBottom: 24 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  modalBtnText: { fontSize: 16, fontWeight: '700' },
});
