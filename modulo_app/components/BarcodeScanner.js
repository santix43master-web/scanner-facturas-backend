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
          <Text style={[styles.titulo, { color: '#FFF' }]}>Escaneá el código de barras</Text>
        </View>
        <View style={[styles.marco, { borderColor: theme.primary }]}>
          <Text style={[{ color: '#FFF', fontSize: 13, opacity: 0.7 }]}>
            {cargando ? 'Buscando...' : 'Apunta al código'}
          </Text>
        </View>
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
  marco: { width: 240, height: 240, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
});
