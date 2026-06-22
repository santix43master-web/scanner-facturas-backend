import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { CameraView } from 'expo-camera';

export default function BarcodeScanner({ onBarcodeScanned, onCancelar, cargando }) {
  return (
    <View style={styles.qrOverlay}>
      <CameraView
        style={styles.qrCamera}
        facing="back"
        onBarcodeScanned={({ data }) => {
          if (data) onBarcodeScanned(data);
        }}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'code128', 'code39', 'itf14'] }}
      >
        <View style={styles.qrHeader}>
          <Text style={styles.qrTitulo}>Escanea el código de barras</Text>
          <Text style={styles.qrSub}>Buscá el código de barras del producto</Text>
        </View>
        <View style={styles.qrMarco}>
          <View style={styles.qrEsquinaTL} />
          <View style={styles.qrEsquinaTR} />
          <View style={styles.qrEsquinaBL} />
          <View style={styles.qrEsquinaBR} />
        </View>
        <View style={styles.barcodeInfo}>
          {cargando ? (
            <ActivityIndicator size="large" color="#00BCD4" />
          ) : (
            <Text style={styles.barcodeInfoText}>Apunta al código de barras del producto</Text>
          )}
        </View>
        <TouchableOpacity style={styles.qrCancelar} onPress={onCancelar}>
          <Text style={styles.qrCancelarText}>Cancelar</Text>
        </TouchableOpacity>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  qrOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200,
  },
  qrCamera: {
    flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 60,
  },
  qrHeader: { alignItems: 'center' },
  qrTitulo: {
    color: '#FFFFFF', fontSize: 20, fontWeight: 'bold',
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 12, overflow: 'hidden',
  },
  qrSub: {
    color: '#B0BEC5', fontSize: 13, marginTop: 8,
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 8, overflow: 'hidden',
  },
  qrMarco: { width: 250, height: 250, position: 'relative' },
  qrEsquinaTL: {
    position: 'absolute', top: 0, left: 0, width: 40, height: 40,
    borderTopWidth: 4, borderLeftWidth: 4, borderColor: '#00BCD4',
  },
  qrEsquinaTR: {
    position: 'absolute', top: 0, right: 0, width: 40, height: 40,
    borderTopWidth: 4, borderRightWidth: 4, borderColor: '#00BCD4',
  },
  qrEsquinaBL: {
    position: 'absolute', bottom: 0, left: 0, width: 40, height: 40,
    borderBottomWidth: 4, borderLeftWidth: 4, borderColor: '#00BCD4',
  },
  qrEsquinaBR: {
    position: 'absolute', bottom: 0, right: 0, width: 40, height: 40,
    borderBottomWidth: 4, borderRightWidth: 4, borderColor: '#00BCD4',
  },
  qrCancelar: {
    backgroundColor: 'rgba(239,83,80,0.9)', paddingHorizontal: 40, paddingVertical: 14, borderRadius: 30,
  },
  qrCancelarText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  barcodeInfo: {
    position: 'absolute', bottom: 100, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 12,
  },
  barcodeInfoText: { color: '#FFFFFF', fontSize: 14 },
});
