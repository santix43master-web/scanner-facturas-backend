import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { CameraView } from 'expo-camera';
import { useTheme } from '../utils/ThemeContext';

export default function QrScanner({ onQrScanned, onBarcodeScanned, onCancelar, cargando }) {
  const { theme } = useTheme();
  const qrScaneado = useRef(false);

  return (
    <View style={styles.overlay}>
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={qrScaneado.current ? undefined : (result) => {
          const tiposBarcode = ['ean13', 'ean8', 'upc_a', 'code128', 'code39', 'itf14'];
          if (result.type === 'qr') {
            qrScaneado.current = true;
            onQrScanned(result.data);
          } else if (tiposBarcode.includes(result.type)) {
            qrScaneado.current = true;
            if (onBarcodeScanned) onBarcodeScanned(result.data);
          }
        }}
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'code128', 'code39', 'itf14'] }}
      >
        <View style={styles.header}>
          {cargando ? (
            <ActivityIndicator size="large" color={theme.primary} />
          ) : (
            <Text style={[styles.titulo, { color: '#FFF' }]}>Escaneá el QR de la factura</Text>
          )}
        </View>
        <View style={[styles.marco, { borderColor: theme.primary }]} />
        <TouchableOpacity onPress={onCancelar}>
          <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '500' }}>Cancelar</Text>
        </TouchableOpacity>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 },
  camera: { flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 80 },
  header: { alignItems: 'center' },
  titulo: { fontSize: 16, fontWeight: '500', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 20, paddingVertical: 10 },
  marco: { width: 240, height: 240, borderWidth: 1 },
});
