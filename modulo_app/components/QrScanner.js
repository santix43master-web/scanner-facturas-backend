import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { CameraView } from 'expo-camera';
import { useTheme } from '../utils/ThemeContext';

export default function QrScanner({ onQrScanned, onBarcodeScanned, onCancelar, cargando }) {
  const { theme } = useTheme();
  const escaneado = useRef(false);

  return (
    <View style={styles.overlay}>
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={escaneado.current ? undefined : (result) => {
          const barcodeTypes = ['ean13', 'ean8', 'upc_a', 'code128', 'code39', 'itf14'];
          escaneado.current = true;
          if (result.type === 'qr') {
            onQrScanned(result.data);
          } else if (barcodeTypes.includes(result.type) && onBarcodeScanned) {
            onBarcodeScanned(result.data);
          } else {
            escaneado.current = false;
          }
        }}
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'code128', 'code39', 'itf14'] }}
      >
        <View style={styles.header}>
          {cargando ? (
            <View style={[styles.cargandoBox, { backgroundColor: theme.overlay }]}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={{ color: '#FFF', marginTop: 12, fontSize: 15, fontWeight: '600' }}>Procesando factura desde SIFEN...</Text>
            </View>
          ) : (
            <>
              <Text style={[styles.texto, { backgroundColor: theme.overlay }]}>Escaneá el QR de la factura</Text>
              <Text style={[styles.sub, { backgroundColor: theme.overlay }]}>También acepta códigos de barras de productos</Text>
            </>
          )}
        </View>
        <View style={[styles.marco, { borderColor: theme.primary }]}>
          <View style={[styles.esqTL, { borderColor: theme.primary }]} />
          <View style={[styles.esqTR, { borderColor: theme.primary }]} />
          <View style={[styles.esqBL, { borderColor: theme.primary }]} />
          <View style={[styles.esqBR, { borderColor: theme.primary }]} />
        </View>
        <TouchableOpacity style={[styles.cancelar, { backgroundColor: theme.danger }]} onPress={onCancelar} activeOpacity={0.85}>
          <Text style={styles.cancelarText}>Cancelar</Text>
        </TouchableOpacity>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 },
  camera: { flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 80 },
  header: { alignItems: 'center' },
  texto: { color: '#FFF', fontSize: 18, fontWeight: '700', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, overflow: 'hidden' },
  sub: { color: '#B0C4DE', fontSize: 12, marginTop: 8, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8, overflow: 'hidden' },
  marco: { width: 250, height: 250, position: 'relative', justifyContent: 'center', alignItems: 'center' },
  esqTL: { position: 'absolute', top: 0, left: 0, width: 40, height: 40, borderTopWidth: 4, borderLeftWidth: 4 },
  esqTR: { position: 'absolute', top: 0, right: 0, width: 40, height: 40, borderTopWidth: 4, borderRightWidth: 4 },
  esqBL: { position: 'absolute', bottom: 0, left: 0, width: 40, height: 40, borderBottomWidth: 4, borderLeftWidth: 4 },
  esqBR: { position: 'absolute', bottom: 0, right: 0, width: 40, height: 40, borderBottomWidth: 4, borderRightWidth: 4 },
  cancelar: { paddingHorizontal: 48, paddingVertical: 16, borderRadius: 30, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
  cancelarText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  cargandoBox: { paddingHorizontal: 30, paddingVertical: 24, borderRadius: 16, alignItems: 'center' },
});
