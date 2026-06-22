import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Image, ActivityIndicator, Alert,
  ScrollView, Modal, Vibration, StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { useTheme } from '../utils/ThemeContext';
import { actualizarPrecios } from '../PriceTracker';
import { comprimirImagen } from '../utils/image';
import { procesarFactura, procesarQr, procesarHtmlCompleto, guardarEnServidor, guardarEnCarpeta, buscarProducto } from '../utils/api';
import QrScanner from '../components/QrScanner';
import CaptchaWebView from '../components/CaptchaWebView';
import { generarPDF } from '../components/PDFGenerator';

export default function EscanearScreen({ sucursalActual, urlServidor, onFacturaProcesada }) {
  const { theme } = useTheme();
  const [fotos, setFotos] = useState([]);
  const [datosFactura, setDatosFactura] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [cambiosPrecios, setCambiosPrecios] = useState([]);
  const [qrActivo, setQrActivo] = useState(false);
  const [qrCargando, setQrCargando] = useState(false);
  const [captchaVisible, setCaptchaVisible] = useState(false);
  const [captchaCargando, setCaptchaCargando] = useState(false);
  const qrScaneado = useRef(false);
  const qrContentRef = useRef('');

  const tomarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert("Permiso denegado", "Necesitamos acceso a la camara"); return; }
    try {
      const result = await ImagePicker.launchCameraAsync({ quality: 0.3, allowsEditing: false, base64: false });
      if (!result.canceled && result.assets?.length > 0) {
        setFotos(prev => [...prev, result.assets[0].uri]);
        setDatosFactura(null);
      }
    } catch { Alert.alert('Error', 'No se pudo abrir la camara'); }
  };

  const seleccionarGaleria = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.3 });
      if (!result.canceled && result.assets?.length > 0) {
        setFotos(prev => [...prev, result.assets[0].uri]);
        setDatosFactura(null);
      }
    } catch { Alert.alert("Error", "No se pudo seleccionar la imagen"); }
  };

  const procesarIA = async () => {
    if (fotos.length === 0) { Alert.alert("Error", "No hay fotos"); return; }
    setCargando(true);
    setDatosFactura(null);
    try {
      const fotosComprimidas = await Promise.all(fotos.map(f => comprimirImagen(f)));
      const json = await procesarFactura(fotosComprimidas, sucursalActual, urlServidor);
      if (json.error) { Alert.alert("Error del servidor", json.error); return; }
      setDatosFactura(json);
      const cambios = await actualizarPrecios(json);
      if (cambios) setCambiosPrecios(cambios);
      if (onFacturaProcesada) onFacturaProcesada(json);
      Vibration.vibrate(200);
    } catch (error) {
      Alert.alert("Error de conexion", `No se pudo procesar la factura.\n\n${error.message}`);
    } finally { setCargando(false); }
  };

  const escanearQR = async (qrContent) => {
    setQrCargando(true);
    try {
      const contenidoLimpio = qrContent.replace(/^DEMO\s*\n?/, '').trim();
      qrContentRef.current = contenidoLimpio;
      const json = await procesarQr(contenidoLimpio, sucursalActual, urlServidor);
      if (json.error) throw new Error(json.error);
      setQrActivo(false);
      setDatosFactura(json);
      const cambios = await actualizarPrecios(json);
      if (cambios) setCambiosPrecios(cambios);
      if (onFacturaProcesada) onFacturaProcesada(json);
      Vibration.vibrate(200);
    } catch (error) {
      qrScaneado.current = false;
      Alert.alert("Error QR", `No se pudo procesar: ${error.message}`);
    } finally { setQrCargando(false); }
  };

  const escanearBarcode = async (codigo) => {
    try {
      const json = await buscarProducto(codigo, urlServidor);
      if (json.resultados && json.resultados.length > 0) {
        Alert.alert("Producto encontrado", `Se encontraron ${json.resultados.length} registros. Revisá la pestaña Precios.`);
      } else {
        Alert.alert("Producto no encontrado", "Aún no ha sido escaneado en ninguna factura.");
      }
    } catch (e) {
      Alert.alert("Error", `No se pudo buscar: ${e.message}`);
    }
  };

  const handleCaptchaDatos = async (data) => {
    setCaptchaCargando(true);
    try {
      const json = await procesarHtmlCompleto({ html: data.html || '', url: data.url || '', de_data: data.de_data || null, qr_params: { qr: qrContentRef.current } }, urlServidor);
      if (json.error) throw new Error(json.error);
      if (!json.items || json.items.length === 0) throw new Error("sin items");
      setDatosFactura(prev => ({ ...prev, ...json }));
      const cambios = await actualizarPrecios(json);
      if (cambios) setCambiosPrecios(cambios);
      if (onFacturaProcesada) onFacturaProcesada(json);
      setCaptchaVisible(false);
    } catch { setCaptchaCargando(false); }
  };

  const enviarARed = async () => {
    if (!datosFactura) { Alert.alert("Error", "No hay datos"); return; }
    try {
      setCargando(true);
      await guardarEnServidor(datosFactura, sucursalActual, urlServidor);
      setFotos([]); setDatosFactura(null);
    } catch (error) {
      Alert.alert("Error de envio", `No se pudo guardar.\n\n${error.message}`);
    } finally { setCargando(false); }
  };

  const enviarACarpetaAction = async () => {
    if (!datosFactura) { Alert.alert("Error", "No hay datos"); return; }
    try {
      setCargando(true);
      await guardarEnCarpeta(datosFactura, sucursalActual);
      setFotos([]); setDatosFactura(null);
    } catch (error) {
      Alert.alert("Error de red", `No se pudo conectar.\n\n${error.message}`);
    } finally { setCargando(false); }
  };

  const generarPDFAction = async () => {
    if (!datosFactura) { Alert.alert("Aviso", "Primero procesá una factura"); return; }
    try {
      setCargando(true);
      const htmlContent = generarPDF(datosFactura, sucursalActual);
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Compartir Factura PDF', UTI: 'com.adobe.pdf' });
      }
    } catch (error) {
      Alert.alert("Error", `No se pudo generar el PDF: ${error.message}`);
    } finally { setCargando(false); }
  };

  const agregarFoto = () => {
    Alert.alert("Agregar página", "", [
      { text: "Cámara", onPress: tomarFoto },
      { text: "Galería", onPress: seleccionarGaleria },
      { text: "Cancelar", style: "cancel" },
    ]);
  };

  return (
    <>
      {fotos.length === 0 ? (
        <View style={styles.menu}>
          <TouchableOpacity onPress={tomarFoto} disabled={cargando}>
            <View style={[styles.btnGrande, { borderColor: theme.primary }]}>
              <Text style={[styles.btnGrandeIcono, { color: theme.primary }]}>+</Text>
              <Text style={[styles.btnGrandeText, { color: theme.text }]}>Cámara</Text>
            </View>
          </TouchableOpacity>
          <Text style={[styles.divider, { color: theme.textMuted }]}>o</Text>
          <TouchableOpacity onPress={seleccionarGaleria} disabled={cargando}>
            <View style={[styles.btnGrande, { borderColor: theme.textSecondary }]}>
              <Text style={[styles.btnGrandeIcono, { color: theme.textSecondary }]}>+</Text>
              <Text style={[styles.btnGrandeText, { color: theme.text }]}>Galería</Text>
            </View>
          </TouchableOpacity>
          <Text style={[styles.divider, { color: theme.textMuted }]}>o</Text>
          <TouchableOpacity onPress={() => { setQrActivo(true); qrScaneado.current = false; }} disabled={cargando}>
            <View style={[styles.btnGrande, { borderColor: theme.accent }]}>
              <Text style={[styles.btnGrandeIcono, { color: theme.primary }]}>⊞</Text>
              <Text style={[styles.btnGrandeText, { color: theme.text }]}>QR</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.previaContainer}>
          <Text style={[styles.paginasLabel, { color: theme.textSecondary }]}>{fotos.length} página(s)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.paginasScroll}>
            {fotos.map((f, i) => (
              <TouchableOpacity key={i} onPress={() => {
                const nuevas = fotos.filter((_, idx) => idx !== i);
                setFotos(nuevas);
                if (nuevas.length === 0) setDatosFactura(null);
              }}>
                <Image source={{ uri: f }} style={[styles.paginaMini, { borderColor: theme.border }]} />
                <View style={styles.paginaBorrar}><Text style={styles.paginaBorrarText}>✕</Text></View>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.row}>
            <TouchableOpacity onPress={agregarFoto} disabled={cargando}>
              <Text style={[styles.btnLink, { color: theme.textSecondary }]}>+ Agregar</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={procesarIA} disabled={cargando}>
              <Text style={[styles.btnLink, { color: cargando ? theme.textMuted : theme.primary }]}>
                {cargando ? "Procesando..." : `Procesar (${fotos.length})`}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => { setFotos([]); setDatosFactura(null); }} disabled={cargando}>
            <Text style={[styles.btnLink, { color: theme.textMuted, marginTop: 8 }]}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}

      {cargando && (
        <View style={styles.cargandoBox}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.cargandoText, { color: theme.textSecondary, marginTop: 8 }]}>Procesando...</Text>
        </View>
      )}

      {datosFactura && (
        <View style={styles.resultados}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Factura</Text>
          <View style={[styles.infoGrid, { borderColor: theme.border }]}>
            {[
              { label: 'Vendedor', value: datosFactura.nombreVendedor },
              { label: 'RUC Vendedor', value: datosFactura.rucVendedor },
              { label: 'RUC Comprador', value: datosFactura.rucComprador },
              { label: 'N° Factura', value: datosFactura.numeroFactura },
              { label: 'Timbrado', value: datosFactura.timbrado },
              { label: 'Emisión', value: datosFactura.fechaEmision },
            ].map((d, i) => (
              <View key={i} style={[styles.infoRow, i < 5 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>{d.label}</Text>
                <Text style={[styles.infoValor, { color: theme.text }]}>{d.value || '—'}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.totalCard, { backgroundColor: theme.primary }]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalMonto}>
              {(datosFactura.totalGeneral || 0).toLocaleString('es-PY')} Gs.
            </Text>
          </View>
          {(!datosFactura.items || datosFactura.items.length === 0) && datosFactura.fuente !== "SIFEN/KUDE QR" && (
            <View style={[styles.captchaBanner, { borderColor: theme.warning }]}>
              <Text style={[styles.captchaText, { color: theme.warningText }]}>No se obtuvieron los artículos. Resolvé el captcha en SIFEN.</Text>
              <TouchableOpacity onPress={() => setCaptchaVisible(true)}>
                <Text style={[styles.btnLink, { color: theme.warning, marginTop: 8 }]}>Resolver captcha</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 24 }]}>
            Artículos ({datosFactura.items?.length || 0})
          </Text>
          {datosFactura.items && datosFactura.items.length > 0 ? (
            datosFactura.items.map((it, idx) => {
              const cambio = cambiosPrecios.find(c => c.codigo === it.codigo || c.codigo === it.codigo_barras);
              return (
                <View key={idx} style={[styles.card, { borderColor: theme.border }]}>
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardNumero, { color: theme.textMuted }]}>{idx + 1}.</Text>
                    <Text style={[styles.cardDesc, { color: theme.text }]} numberOfLines={2}>{it.descripcion || ''}</Text>
                  </View>
                  <View style={styles.cardDetail}>
                    {it.codigo ? <Text style={[styles.cardTag, { color: theme.textSecondary }]}>Cod: {it.codigo}</Text> : null}
                    <Text style={[styles.cardPrecio, { color: theme.textSecondary }]}>{it.cantidad || 1} × {Number(it.precio_unitario || 0).toLocaleString('es-PY')} Gs.</Text>
                  </View>
                  <Text style={[styles.cardSubtotal, { color: theme.primary }]}>
                    {(it.subtotal || 0).toLocaleString('es-PY')} Gs.
                  </Text>
                  {cambio && !cambio.esPrimeraVez && (
                    <Text style={[styles.cambioText, { color: cambio.diferencia > 0 ? theme.danger : theme.success }]}>
                      {Number(cambio.precioAnterior).toLocaleString('es-PY')} → {Number(cambio.precioActual).toLocaleString('es-PY')} Gs ({cambio.porcentaje}%)
                    </Text>
                  )}
                  {cambio && cambio.esPrimeraVez && (
                    <Text style={[styles.cambioText, { color: theme.textMuted }]}>Primera vez</Text>
                  )}
                </View>
              );
            })
          ) : (
            <Text style={[styles.card, { borderColor: theme.border, color: theme.textSecondary, textAlign: 'center', padding: 24 }]}>Sin artículos</Text>
          )}
          <View style={styles.actionRow}>
            <TouchableOpacity onPress={generarPDFAction} disabled={cargando}>
              <Text style={[styles.btnAction, { color: theme.danger }]}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={enviarARed} disabled={cargando}>
              <Text style={[styles.btnAction, { color: theme.primary }]}>Enviar</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={enviarACarpetaAction} disabled={cargando} style={{ marginBottom: 24 }}>
            <Text style={[styles.btnAction, { color: theme.warning }]}>Carpeta compartida</Text>
          </TouchableOpacity>
        </View>
      )}

      {qrActivo && (
        <QrScanner
          onQrScanned={escanearQR}
          onBarcodeScanned={escanearBarcode}
          onCancelar={() => { setQrActivo(false); qrScaneado.current = false; }}
          cargando={qrCargando}
        />
      )}

      {captchaVisible && (
        <CaptchaWebView
          visible={captchaVisible}
          qrContent={qrContentRef.current}
          onDatos={handleCaptchaDatos}
          onCargando={captchaCargando}
          onClose={() => setCaptchaVisible(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  menu: { width: '100%', marginTop: 20 },
  btnGrande: { paddingVertical: 48, borderRadius: 0, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed' },
  btnGrandeIcono: { fontSize: 32, marginBottom: 8 },
  btnGrandeText: { fontSize: 15, fontWeight: '500' },
  divider: { textAlign: 'center', marginVertical: 16, fontSize: 12, textTransform: 'lowercase' },
  previaContainer: { width: '100%', alignItems: 'center' },
  paginasLabel: { fontSize: 13, marginBottom: 12, alignSelf: 'flex-start' },
  paginasScroll: { maxHeight: 140, marginBottom: 16 },
  paginaMini: { width: 80, height: 120, marginRight: 8, borderWidth: 1 },
  paginaBorrar: { position: 'absolute', top: -8, right: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: '#EF5350', justifyContent: 'center', alignItems: 'center' },
  paginaBorrarText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  row: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  btnLink: { fontSize: 14, fontWeight: '500' },
  cargandoBox: { marginTop: 32, alignItems: 'center' },
  cargandoText: { fontSize: 13 },
  resultados: { width: '100%', marginTop: 24 },
  sectionTitle: { fontSize: 20, fontWeight: '600', marginBottom: 16 },
  infoGrid: { borderWidth: 1, marginBottom: 16 },
  infoRow: { paddingVertical: 10, paddingHorizontal: 12 },
  infoLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1, marginBottom: 2 },
  infoValor: { fontSize: 14 },
  totalCard: { padding: 24, alignItems: 'center', marginBottom: 16 },
  totalLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1, opacity: 0.8 },
  totalMonto: { fontSize: 24, fontWeight: '600', marginTop: 4, color: '#FFFFFF' },
  captchaBanner: { borderWidth: 1, padding: 16, marginBottom: 16 },
  captchaText: { fontSize: 13, textAlign: 'center' },
  card: { padding: 16, borderBottomWidth: 1, marginBottom: 0 },
  cardHeader: { flexDirection: 'row', marginBottom: 6 },
  cardNumero: { fontSize: 12, fontWeight: '600', width: 24 },
  cardDesc: { flex: 1, fontSize: 14, fontWeight: '500' },
  cardDetail: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginLeft: 24, marginBottom: 4 },
  cardTag: { fontSize: 12 },
  cardPrecio: { fontSize: 13 },
  cardSubtotal: { fontSize: 14, fontWeight: '600', marginLeft: 24, marginTop: 4 },
  cambioText: { fontSize: 12, fontWeight: '500', marginLeft: 24, marginTop: 4 },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, marginTop: 24, marginBottom: 16 },
  btnAction: { fontSize: 15, fontWeight: '600', letterSpacing: 1 },
});
