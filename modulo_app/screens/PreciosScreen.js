import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, StyleSheet } from 'react-native';
import { buscarProducto } from '../utils/api';
import BarcodeScanner from '../components/BarcodeScanner';

export default function PreciosScreen({ urlServidor }) {
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
      <TouchableOpacity style={styles.btnBarcode} onPress={() => { setBarcodeActivo(true); }} disabled={barcodeCargando} activeOpacity={0.85}>
        <Text style={styles.btnBarcodeIcono}>≡</Text>
        <Text style={styles.btnBarcodeText}>CÓDIGO DE BARRAS</Text>
        <Text style={styles.btnBarcodeSub}>Escaneá el código con la cámara</Text>
      </TouchableOpacity>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>O</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity style={styles.btnBarcodeManual} onPress={() => { setModalBarcodeManual(true); setInputBarcode(''); }} disabled={barcodeCargando} activeOpacity={0.85}>
        <Text style={styles.btnBarcodeManualIcono}>⌨</Text>
        <Text style={styles.btnBarcodeManualText}>INGRESAR CÓDIGO</Text>
        <Text style={styles.btnBarcodeManualSub}>Tipeá código o código de barras</Text>
      </TouchableOpacity>

      {preciosHistorial.length > 0 && (
        <View style={styles.preciosSection}>
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>RESULTADOS</Text>
            <View style={styles.dividerLine} />
          </View>
          {preciosHistorial.map((p, i) => (
            <View key={i} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardNumero}><Text style={styles.cardNumeroText}>{i + 1}</Text></View>
                <Text style={styles.cardDescripcion} numberOfLines={2}>{p.descripcion || 'Producto'}</Text>
              </View>
              <View style={styles.cardDetalles}>
                <Text style={styles.cardTag}>{p.vendedor}</Text>
                <Text style={styles.cardTag}>{p.fecha}</Text>
              </View>
              <View style={styles.precioRow}>
                <Text style={styles.precioValor}>{Number(p.precio).toLocaleString('es-PY')} Gs</Text>
                <Text style={styles.precioFactura}>Factura N° {p.factura}</Text>
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
          <View style={styles.modalContainer}>
            <Text style={[styles.modalTitulo, { color: '#00BCD4' }]}>Buscar producto</Text>
            <Text style={styles.modalSubtitulo}>Ingresá código o código de barras del producto</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Código o código de barras"
              placeholderTextColor="#90A4AE"
              value={inputBarcode}
              onChangeText={setInputBarcode}
              autoFocus={true}
              autoCapitalize="none"
            />
            <View style={styles.modalBotones}>
              <TouchableOpacity style={styles.btnModalCancelar} onPress={() => setModalBarcodeManual(false)}>
                <Text style={styles.btnModalTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnModalConfirmar} onPress={() => { setModalBarcodeManual(false); buscarPrecios(inputBarcode.trim()); }}>
                <Text style={styles.btnModalTextoConfirmar}>Buscar</Text>
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
  dividerLine: { flex: 1, height: 1, backgroundColor: '#2A3F4F' },
  dividerText: { color: '#546E7A', marginHorizontal: 15, fontSize: 13 },
  btnBarcode: { backgroundColor: '#1B2838', paddingVertical: 24, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#66BB6A' },
  btnBarcodeIcono: { fontSize: 36, marginBottom: 8, color: '#66BB6A' },
  btnBarcodeText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
  btnBarcodeSub: { color: '#78909C', fontSize: 13, marginTop: 6 },
  btnBarcodeManual: { backgroundColor: '#1B2838', paddingVertical: 24, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#FFA726', marginTop: 15 },
  btnBarcodeManualIcono: { fontSize: 32, marginBottom: 8 },
  btnBarcodeManualText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
  btnBarcodeManualSub: { color: '#78909C', fontSize: 13, marginTop: 6 },
  preciosSection: { width: '100%', marginTop: 25 },
  card: { backgroundColor: '#1B2838', padding: 16, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#2A3F4F' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardNumero: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#00BCD4', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  cardNumeroText: { color: '#0D1B2A', fontWeight: 'bold', fontSize: 12 },
  cardDescripcion: { flex: 1, fontWeight: 'bold', fontSize: 14, color: '#FFFFFF' },
  cardDetalles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, marginLeft: 36 },
  cardTag: { backgroundColor: '#2A3F4F', color: '#B0BEC5', fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  precioRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginLeft: 40, marginTop: 6 },
  precioValor: { color: '#00BCD4', fontWeight: 'bold', fontSize: 18 },
  precioFactura: { color: '#78909C', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { backgroundColor: '#1B2838', borderRadius: 20, padding: 25, width: '85%', borderWidth: 1, borderColor: '#2A3F4F' },
  modalTitulo: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  modalSubtitulo: { fontSize: 14, color: '#78909C', textAlign: 'center', marginBottom: 20 },
  modalInput: { borderWidth: 1, borderColor: '#2A3F4F', borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 20, backgroundColor: '#0D1B2A', color: '#FFFFFF' },
  modalBotones: { flexDirection: 'row', gap: 12 },
  btnModalCancelar: { flex: 1, backgroundColor: '#37474F', padding: 14, borderRadius: 12, alignItems: 'center' },
  btnModalConfirmar: { flex: 1, backgroundColor: '#00BCD4', padding: 14, borderRadius: 12, alignItems: 'center' },
  btnModalTexto: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  btnModalTextoConfirmar: { color: '#0D1B2A', fontWeight: 'bold', fontSize: 15 },
});
