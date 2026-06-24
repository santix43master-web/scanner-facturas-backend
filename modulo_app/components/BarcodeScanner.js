import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { CameraView } from 'expo-camera';
import { useTheme } from '../utils/ThemeContext';

export default function BarcodeScanner({ onBarcodeScanned, onCancelar, cargando }) {
  const { theme } = useTheme();

  return (
    <View style={styles.overlay}>
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={({ data }) => { if (data) onBarcodeScanned(data); }}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'code128', 'code39', 'itf14'] }}
      >
        <View style={styles.header}>
          <Text style={[styles.texto, { backgroundColor: theme.overlay }]}>Escaneá el código de barras</Text>
          <Text style={[styles.sub, { backgroundColor: theme.overlay }]}>Buscá el código de barras del producto</Text>
        </View>
        <View style={[styles.marco, { borderColor: theme.primary }]}>
          <View style={[styles.esqTL, { borderColor: theme.primary }]} />
          <View style={[styles.esqTR, { borderColor: theme.primary }]} />
          <View style={[styles.esqBL, { borderColor: theme.primary }]} />
          <View style={[styles.esqBR, { borderColor: theme.primary }]} />
        </View>
        <View style={styles.barcodeInfo}>
          {cargando ? (
            <ActivityIndicator size="large" color={theme.primary} />
          ) : (
            <Text style={[styles.infoText, { backgroundColor: theme.overlay }]}>Apunta al código de barras del producto</Text>
          )}
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
  marco: { width: 250, height: 250, position: 'relative' },
  esqTL: { position: 'absolute', top: 0, left: 0, width: 40, height: 40, borderTopWidth: 4, borderLeftWidth: 4 },
  esqTR: { position: 'absolute', top: 0, right: 0, width: 40, height: 40, borderTopWidth: 4, borderRightWidth: 4 },
  esqBL: { position: 'absolute', bottom: 0, left: 0, width: 40, height: 40, borderBottomWidth: 4, borderLeftWidth: 4 },
  esqBR: { position: 'absolute', bottom: 0, right: 0, width: 40, height: 40, borderBottomWidth: 4, borderRightWidth: 4 },
  barcodeInfo: { position: 'absolute', bottom: 110, alignSelf: 'center' },
  infoText: { color: '#FFF', fontSize: 14, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, overflow: 'hidden' },
  cancelar: { paddingHorizontal: 48, paddingVertical: 16, borderRadius: 30, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
  cancelarText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
});
