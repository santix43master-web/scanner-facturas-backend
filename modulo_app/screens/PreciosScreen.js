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
    } finally {
      setBarcodeCargando(false);
    }
  };

  const escanearBarcode = async (codigo) => {
    setBarcodeActivo(false);
    await buscarPrecios(codigo);
  };

  return (
    <View style={styles.menu}>
      <TouchableOpacity style={[styles.btnBarcode, { backgroundColor: theme.surface, borderColor: theme.success }]} onPress={() => { setBarcodeActivo(true); }} disabled={barcodeCargando} activeOpacity={0.85}>
        <Text style={[styles.btnBarcodeIcono, { color: theme.success }]}>≡</Text>
        <Text style={[styles.btnBarcodeText, { color: theme.text }]}>CÓDIGO DE BARRAS</Text>
        <Text style={[styles.btnBarcodeSub, { color: theme.textSecondary }]}>Escaneá el código con la cámara</Text>
      </TouchableOpacity>

      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
        <Text style={[styles.dividerText, { color: theme.textMuted }]}>O</Text>
        <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
      </View>

      <TouchableOpacity style={[styles.btnBarcodeManual, { backgroundColor: theme.surface, borderColor: theme.accent }]} onPress={() => { setModalBarcodeManual(true); setInputBarcode(''); }} disabled={barcodeCargando} activeOpacity={0.85}>
        <Text style={[styles.btnBarcodeManualIcono, { color: theme.accent }]}>⌨</Text>
        <Text style={[styles.btnBarcodeManualText, { color: theme.text }]}>INGRESAR CÓDIGO</Text>
        <Text style={[styles.btnBarcodeManualSub, { color: theme.textSecondary }]}>Tipeá código o código de barras</Text>
      </TouchableOpacity>

      {preciosHistorial.length > 0 && (
        <View style={styles.preciosSection}>
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            <Text style={[styles.dividerText, { color: theme.textMuted }]}>RESULTADOS</Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          </View>
          {preciosHistorial.map((p, i) => (
            <View key={i} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardNumero, { backgroundColor: theme.primary }]}><Text style={[styles.cardNumeroText, { color: theme.badgeText }]}>{i + 1}</Text></View>
                <Text style={[styles.cardDescripcion, { color: theme.text }]} numberOfLines={2}>{p.descripcion || 'Producto'}</Text>
              </View>
              <View style={styles.cardDetalles}>
                <Text style={[styles.cardTag, { backgroundColor: theme.cardTag, color: theme.cardTagText }]}>{p.vendedor}</Text>
                <Text style={[styles.cardTag, { backgroundColor: theme.cardTag, color: theme.cardTagText }]}>{p.fecha}</Text>
              </View>
              <View style={styles.precioRow}>
                <Text style={[styles.precioValor, { color: theme.primary }]}>{Number(p.precio).toLocaleString('es-PY')} Gs</Text>
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

      <Modal visible={modalBarcodeManual} transparent={true} animationType="fade" onRequestClose={() => setModalBarcodeManual(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.modalTitulo, { color: theme.primary }]}>Buscar producto</Text>
            <Text style={[styles.modalSubtitulo, { color: theme.textSecondary }]}>Ingresá código o código de barras del producto</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              placeholder="Código o código de barras"
              placeholderTextColor={theme.textMuted}
              value={inputBarcode}
              onChangeText={setInputBarcode}
              autoFocus={true}
              autoCapitalize="none"
            />
            <View style={styles.modalBotones}>
              <TouchableOpacity style={[styles.btnModalCancelar, { backgroundColor: theme.textMuted }]} onPress={() => setModalBarcodeManual(false)}>
                <Text style={[styles.btnModalTexto, { color: theme.surface }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnModalConfirmar, { backgroundColor: theme.primary }]} onPress={() => { setModalBarcodeManual(false); buscarPrecios(inputBarcode.trim()); }}>
                <Text style={[styles.btnModalTextoConfirmar, { color: theme.badgeText }]}>Buscar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  menu: { width: '100%', marginTop: 30 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 22 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 15, fontSize: 13 },
  btnBarcode: { paddingVertical: 24, borderRadius: 20, alignItems: 'center', borderWidth: 1 },
  btnBarcodeIcono: { fontSize: 36, marginBottom: 8 },
  btnBarcodeText: { fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
  btnBarcodeSub: { fontSize: 13, marginTop: 6 },
  btnBarcodeManual: { paddingVertical: 24, borderRadius: 20, alignItems: 'center', borderWidth: 1, marginTop: 15 },
  btnBarcodeManualIcono: { fontSize: 32, marginBottom: 8 },
  btnBarcodeManualText: { fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
  btnBarcodeManualSub: { fontSize: 13, marginTop: 6 },
  preciosSection: { width: '100%', marginTop: 25 },
  card: { padding: 16, borderRadius: 14, marginBottom: 10, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardNumero: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  cardNumeroText: { fontWeight: 'bold', fontSize: 12 },
  cardDescripcion: { flex: 1, fontWeight: 'bold', fontSize: 14 },
  cardDetalles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, marginLeft: 36 },
  cardTag: { fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  precioRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginLeft: 40, marginTop: 6 },
  precioValor: { fontWeight: 'bold', fontSize: 18 },
  precioFactura: { fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { borderRadius: 20, padding: 25, width: '85%', borderWidth: 1 },
  modalTitulo: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  modalSubtitulo: { fontSize: 14, textAlign: 'center', marginBottom: 20 },
  modalInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 20 },
  modalBotones: { flexDirection: 'row', gap: 12 },
  btnModalCancelar: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  btnModalConfirmar: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  btnModalTexto: { fontWeight: 'bold', fontSize: 15 },
  btnModalTextoConfirmar: { fontWeight: 'bold', fontSize: 15 },
});
