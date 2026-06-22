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
        Alert.alert("Sin resultados", `No se encontraron precios para ${codigo}`);
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
      <TouchableOpacity onPress={() => setBarcodeActivo(true)} disabled={barcodeCargando}>
        <View style={[styles.btnGrande, { borderColor: theme.success }]}>
          <Text style={[styles.btnGrandeIcono, { color: theme.success }]}>≡</Text>
          <Text style={[styles.btnGrandeText, { color: theme.text }]}>Código de barras</Text>
        </View>
      </TouchableOpacity>

      <Text style={[styles.divider, { color: theme.textMuted }]}>o</Text>

      <TouchableOpacity onPress={() => { setModalBarcodeManual(true); setInputBarcode(''); }} disabled={barcodeCargando}>
        <View style={[styles.btnGrande, { borderColor: theme.accent }]}>
          <Text style={[styles.btnGrandeIcono, { color: theme.accent }]}>⌨</Text>
          <Text style={[styles.btnGrandeText, { color: theme.text }]}>Ingresar código</Text>
        </View>
      </TouchableOpacity>

      {preciosHistorial.length > 0 && (
        <View style={styles.resultados}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Resultados</Text>
          {preciosHistorial.map((p, i) => (
            <View key={i} style={[styles.card, { borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardNum, { color: theme.textMuted }]}>{i + 1}.</Text>
                <Text style={[styles.cardDesc, { color: theme.text }]} numberOfLines={2}>{p.descripcion || 'Producto'}</Text>
              </View>
              <View style={styles.cardRow}>
                <Text style={[styles.cardTag, { color: theme.textSecondary }]}>{p.vendedor}</Text>
                <Text style={[styles.cardTag, { color: theme.textSecondary }]}>{p.fecha}</Text>
              </View>
              <View style={styles.precioRow}>
                <Text style={[styles.precioValor, { color: theme.primary }]}>{Number(p.precio).toLocaleString('es-PY')} Gs</Text>
                <Text style={[styles.precioFactura, { color: theme.textMuted }]}>N° {p.factura}</Text>
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
          <View style={[styles.modalContainer, { backgroundColor: theme.surface }]}>
            <TextInput
              style={[styles.modalInput, { borderColor: theme.border, color: theme.text }]}
              placeholder="Código o código de barras"
              placeholderTextColor={theme.textMuted}
              value={inputBarcode}
              onChangeText={setInputBarcode}
              autoFocus
              autoCapitalize="none"
            />
            <View style={styles.modalBotones}>
              <TouchableOpacity onPress={() => setModalBarcodeManual(false)}>
                <Text style={[styles.btnModal, { color: theme.textSecondary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setModalBarcodeManual(false); buscarPrecios(inputBarcode.trim()); }}>
                <Text style={[styles.btnModal, { color: theme.primary }]}>Buscar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  menu: { width: '100%', marginTop: 20 },
  btnGrande: { paddingVertical: 48, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed' },
  btnGrandeIcono: { fontSize: 32, marginBottom: 8 },
  btnGrandeText: { fontSize: 15, fontWeight: '500' },
  divider: { textAlign: 'center', marginVertical: 16, fontSize: 12, textTransform: 'lowercase' },
  resultados: { width: '100%', marginTop: 24 },
  sectionTitle: { fontSize: 20, fontWeight: '600', marginBottom: 16 },
  card: { padding: 16, borderBottomWidth: 1 },
  cardHeader: { flexDirection: 'row', marginBottom: 6 },
  cardNum: { fontSize: 12, fontWeight: '600', width: 24 },
  cardDesc: { flex: 1, fontSize: 14, fontWeight: '500' },
  cardRow: { flexDirection: 'row', gap: 12, marginLeft: 24, marginBottom: 4 },
  cardTag: { fontSize: 12 },
  precioRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginLeft: 24, marginTop: 4 },
  precioValor: { fontSize: 18, fontWeight: '600' },
  precioFactura: { fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { padding: 24, width: '80%' },
  modalInput: { borderBottomWidth: 1, padding: 12, fontSize: 16, marginBottom: 20 },
  modalBotones: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20 },
  btnModal: { fontSize: 15, fontWeight: '500' },
});
