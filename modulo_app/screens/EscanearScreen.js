import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Image, ActivityIndicator, Alert,
  ScrollView, Modal, Vibration, StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { actualizarPrecios } from '../PriceTracker';
import { comprimirImagen } from '../utils/image';
import { procesarFactura, procesarQr, procesarHtmlCompleto, guardarEnServidor, guardarEnCarpeta } from '../utils/api';
import QrScanner from '../components/QrScanner';
import CaptchaWebView from '../components/CaptchaWebView';
import { generarPDF } from '../components/PDFGenerator';

export default function EscanearScreen({ sucursalActual, urlServidor, onFacturaProcesada }) {
  const [fotos, setFotos] = useState([]);
  const [datosFactura, setDatosFactura] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [cambiosPrecios, setCambiosPrecios] = useState([]);
  const [qrActivo, setQrActivo] = useState(false);
  const [qrCargando, setQrCargando] = useState(false);
  const [captchaVisible, setCaptchaVisible] = useState(false);
  const [captchaCargando, setCaptchaCargando] = useState(false);
  const [modalAgregar, setModalAgregar] = useState(false);
  const qrScaneado = useRef(false);
  const qrContentRef = useRef('');

  const tomarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert("Permiso denegado", "Necesitamos acceso a la camara");
      return;
    }
    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.3, allowsEditing: false, base64: false,
      });
      if (!result.canceled && result.assets?.length > 0) {
        setFotos(prev => [...prev, result.assets[0].uri]);
        setDatosFactura(null);
      }
    } catch (err) {
      Alert.alert('Error', 'No se pudo abrir la camara');
    }
  };

  const seleccionarGaleria = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: false, quality: 0.3,
      });
      if (!result.canceled && result.assets?.length > 0) {
        setFotos(prev => [...prev, result.assets[0].uri]);
        setDatosFactura(null);
      }
    } catch (error) {
      Alert.alert("Error", "No se pudo seleccionar la imagen");
    }
  };

  const procesarIA = async () => {
    if (fotos.length === 0) {
      Alert.alert("Error", "No hay fotos para procesar");
      return;
    }
    setCargando(true);
    setDatosFactura(null);

    try {
      const fotosComprimidas = await Promise.all(fotos.map(f => comprimirImagen(f)));
      const json = await procesarFactura(fotosComprimidas, sucursalActual, urlServidor);
      if (json.error) {
        Alert.alert("Error del servidor", json.error);
        return;
      }
      setDatosFactura(json);
      const cambios = await actualizarPrecios(json);
      if (cambios) setCambiosPrecios(cambios);
      if (onFacturaProcesada) onFacturaProcesada(json);
      Vibration.vibrate(200);
    } catch (error) {
      Alert.alert("Error de conexion", `No se pudo procesar la factura.\n\nDetalles: ${error.message}`);
    } finally {
      setCargando(false);
    }
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
    } finally {
      setQrCargando(false);
    }
  };

  const handleCaptchaDatos = async (data) => {
    setCaptchaCargando(true);
    try {
      const json = await procesarHtmlCompleto({
        html: data.html || '',
        url: data.url || '',
        de_data: data.de_data || null,
        qr_params: { qr: qrContentRef.current },
      }, urlServidor);
      if (json.error) throw new Error(json.error);
      if (!json.items || json.items.length === 0) throw new Error("sin items");
      setDatosFactura(prev => ({ ...prev, ...json }));
      const cambios = await actualizarPrecios(json);
      if (cambios) setCambiosPrecios(cambios);
      if (onFacturaProcesada) onFacturaProcesada(json);
      setCaptchaVisible(false);
    } catch (error) {
      setCaptchaCargando(false);
    }
  };

  const enviarARed = async () => {
    if (!datosFactura) { Alert.alert("Error", "No hay datos para enviar"); return; }
    try {
      setCargando(true);
      await guardarEnServidor(datosFactura, sucursalActual, urlServidor);
      Alert.alert("Enviado", `Factura guardada en buzon de ${sucursalActual}`);
      setFotos([]);
      setDatosFactura(null);
    } catch (error) {
      Alert.alert("Error de envio", `No se pudo guardar en el servidor.\n\nDetalles: ${error.message}`);
    } finally {
      setCargando(false);
    }
  };

  const enviarACarpetaAction = async () => {
    if (!datosFactura) { Alert.alert("Error", "No hay datos para enviar"); return; }
    try {
      setCargando(true);
      await guardarEnCarpeta(datosFactura, sucursalActual);
      Alert.alert("Guardado", `Factura enviada a carpeta compartida (${sucursalActual})`);
      setFotos([]);
      setDatosFactura(null);
    } catch (error) {
      Alert.alert("Error de red", `No se pudo conectar a la carpeta compartida.\n\nDetalles: ${error.message}`);
    } finally {
      setCargando(false);
    }
  };

  const generarPDFAction = async () => {
    if (!datosFactura) { Alert.alert("Aviso", "Primero procesa una factura"); return; }
    try {
      setCargando(true);
      const htmlContent = generarPDF(datosFactura, sucursalActual);
      const { uri } = await Print.printToFileAsync({ html: htmlContent, base64: false });
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf', dialogTitle: 'Compartir Factura PDF', UTI: 'com.adobe.pdf',
        });
        Alert.alert("Listo", "PDF generado correctamente");
      } else {
        Alert.alert("PDF Creado", "El archivo se guardo correctamente.");
      }
    } catch (error) {
      Alert.alert("Error", `No se pudo generar el PDF: ${error.message}`);
    } finally {
      setCargando(false);
    }
  };

  return (
    <>
      {fotos.length === 0 ? (
        <View style={styles.menu}>
          <TouchableOpacity style={styles.btnCamara} onPress={tomarFoto} disabled={cargando} activeOpacity={0.85}>
            <Text style={styles.btnCamaraIcono}>📸</Text>
            <Text style={styles.btnCamaraText}>CÁMARA</Text>
            <Text style={styles.btnCamaraSub}>Escanear factura sin QR</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>O</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity style={styles.btnGaleria} onPress={seleccionarGaleria} disabled={cargando} activeOpacity={0.85}>
            <Text style={styles.btnGaleriaIcono}>🖼</Text>
            <Text style={styles.btnGaleriaText}>GALERÍA</Text>
            <Text style={styles.btnGaleriaSub}>Escanear factura sin QR</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>O</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity style={styles.btnQR} onPress={() => { setQrActivo(true); qrScaneado.current = false; }} disabled={cargando} activeOpacity={0.85}>
            <Text style={styles.btnQRIcono}>▦</Text>
            <Text style={styles.btnQRText}>QR</Text>
            <Text style={styles.btnQRSub}>Escanear factura con QR</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.previaContainer}>
          <Text style={styles.paginasLabel}>Paginas ({fotos.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.paginasScroll}>
            {fotos.map((f, i) => (
              <TouchableOpacity key={i} onPress={() => {
                const nuevas = fotos.filter((_, idx) => idx !== i);
                setFotos(nuevas);
                if (nuevas.length === 0) setDatosFactura(null);
              }}>
                <Image source={{ uri: f }} style={styles.paginaMini} />
                <View style={styles.paginaBorrar}><Text style={styles.paginaBorrarText}>X</Text></View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.row}>
            <TouchableOpacity style={styles.btnAgregar} onPress={() => setModalAgregar(true)} disabled={cargando} activeOpacity={0.85}>
              <Text style={styles.btnChicoText}>+ AGREGAR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnProcesar} onPress={procesarIA} disabled={cargando} activeOpacity={0.85}>
              <Text style={styles.btnChicoText}>{cargando ? "PROCESANDO..." : `PROCESAR (${fotos.length})`}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.btnReiniciar} onPress={() => { setFotos([]); setDatosFactura(null); }} disabled={cargando}>
            <Text style={styles.btnReiniciarText}>Cancelar y empezar de nuevo</Text>
          </TouchableOpacity>
        </View>
      )}

      {cargando && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.loadingText}>Procesando factura...</Text>
        </View>
      )}

      {datosFactura && (
        <View style={styles.resultados}>
          <View style={styles.resultadosHeader}>
            <Text style={styles.resultadosTitulo}>DATOS DE LA FACTURA</Text>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>VENDEDOR</Text>
              <Text style={styles.infoValor}>{datosFactura.nombreVendedor || 'No detectado'}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>RUC VENDEDOR</Text>
              <Text style={styles.infoValor}>{datosFactura.rucVendedor || 'No detectado'}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>RUC COMPRADOR</Text>
              <Text style={styles.infoValor}>{datosFactura.rucComprador || 'No detectado'}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>N° FACTURA</Text>
              <Text style={styles.infoValor}>{datosFactura.numeroFactura || 'No detectado'}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>TIMBRADO</Text>
              <Text style={styles.infoValor}>{datosFactura.timbrado || 'No detectado'}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>FECHA EMISION</Text>
              <Text style={styles.infoValor}>{datosFactura.fechaEmision || 'No detectado'}</Text>
            </View>
          </View>

          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>TOTAL GENERAL</Text>
            <Text style={styles.totalMonto}>
              {datosFactura.totalGeneral ? datosFactura.totalGeneral.toLocaleString('es-PY') : 0} Gs.
            </Text>
          </View>

          {(!datosFactura.items || datosFactura.items.length === 0) && datosFactura.fuente !== "SIFEN/KUDE QR" && (
            <View style={styles.captchaBanner}>
              <Text style={styles.captchaBannerText}>No se pudieron obtener los artículos automáticamente. Resolvé el captcha en el portal de SIFEN para acceder a los datos completos.</Text>
              <TouchableOpacity style={styles.btnCaptcha} onPress={() => setCaptchaVisible(true)} activeOpacity={0.85}>
                <Text style={styles.btnCaptchaText}>RESOLVER CAPTCHA</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.sectionTitulo}>Articulos Extraidos ({datosFactura.items?.length || 0})</Text>

          {datosFactura.items && datosFactura.items.length > 0 ? (
            datosFactura.items.map((it, idx) => {
              const cambio = cambiosPrecios.find(c => c.codigo === it.codigo || c.codigo === it.codigo_barras);
              return (
                <View key={idx} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardNumero}><Text style={styles.cardNumeroText}>{idx + 1}</Text></View>
                    <Text style={styles.cardDescripcion} numberOfLines={2}>{it.descripcion || "Sin descripcion"}</Text>
                  </View>
                  <View style={styles.cardDetalles}>
                    {it.codigo ? <Text style={styles.cardTag}>Cod: {it.codigo}</Text> : null}
                    {it.codigo_barras ? <Text style={styles.cardTag}>EAN: {it.codigo_barras}</Text> : null}
                    <Text style={styles.cardPrecio}>{it.cantidad || 1} x {Number(it.precio_unitario || 0).toLocaleString('es-PY')} Gs.</Text>
                  </View>
                  <Text style={styles.cardSubtotal}>Subtotal: {it.subtotal ? it.subtotal.toLocaleString('es-PY') : 0} Gs.</Text>
                  {cambio && !cambio.esPrimeraVez ? (
                    <View style={styles.precioCambioRow}>
                      <Text style={[styles.precioCambioIcono, { color: cambio.diferencia > 0 ? '#EF5350' : '#66BB6A' }]}>
                        {cambio.diferencia > 0 ? '↑' : '↓'}
                      </Text>
                      <Text style={[styles.precioCambioTexto, { color: cambio.diferencia > 0 ? '#EF5350' : '#66BB6A' }]}>
                        {Number(cambio.precioAnterior).toLocaleString('es-PY')} Gs → {Number(cambio.precioActual).toLocaleString('es-PY')} Gs ({cambio.porcentaje}%)
                      </Text>
                    </View>
                  ) : null}
                  {cambio && cambio.esPrimeraVez ? (
                    <View style={styles.precioCambioRow}>
                      <Text style={[styles.precioCambioIcono, { color: '#90A4AE' }]}>●</Text>
                      <Text style={[styles.precioCambioTexto, { color: '#90A4AE' }]}>Primera vez que se escanea</Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          ) : (
            <View style={styles.noItemsCard}>
              <Text style={styles.noItemsText}>No se detectaron articulos</Text>
            </View>
          )}

          <View style={styles.rowBotones}>
            <TouchableOpacity style={styles.btnPDF} onPress={generarPDFAction} disabled={cargando} activeOpacity={0.85}>
              <Text style={styles.btnAccionText}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnEnviar} onPress={enviarARed} disabled={cargando} activeOpacity={0.85}>
              <Text style={styles.btnAccionText}>ENVIAR</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.btnCarpeta} onPress={enviarACarpetaAction} disabled={cargando} activeOpacity={0.85}>
            <Text style={styles.btnAccionText}>CARPETA COMPARTIDA</Text>
          </TouchableOpacity>
        </View>
      )}

      {qrActivo && (
        <QrScanner
          onQrScanned={escanearQR}
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

      <Modal visible={modalAgregar} transparent={true} animationType="fade" onRequestClose={() => setModalAgregar(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.agregarModal}>
            <Text style={styles.agregarTitulo}>Agregar página</Text>
            <Text style={styles.agregarSub}>Elegí cómo querés capturar la siguiente página</Text>
            <TouchableOpacity style={styles.agregarBtn} onPress={() => { setModalAgregar(false); tomarFoto(); }} activeOpacity={0.85}>
              <Text style={styles.agregarIcono}>📸</Text>
              <Text style={styles.agregarTexto}>CÁMARA</Text>
            </TouchableOpacity>
            <View style={styles.agregarDivider} />
            <TouchableOpacity style={styles.agregarBtn} onPress={() => { setModalAgregar(false); seleccionarGaleria(); }} activeOpacity={0.85}>
              <Text style={styles.agregarIcono}>🖼</Text>
              <Text style={styles.agregarTexto}>GALERÍA</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.agregarCancelar} onPress={() => setModalAgregar(false)}>
              <Text style={styles.agregarCancelarText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  menu: { width: '100%', marginTop: 30 },
  btnCamara: {
    backgroundColor: '#1B2838', paddingVertical: 32, borderRadius: 24, alignItems: 'center',
    borderWidth: 1, borderColor: '#00BCD4', elevation: 8, shadowColor: '#00BCD4',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12,
  },
  btnCamaraIcono: { fontSize: 44, marginBottom: 10 },
  btnCamaraText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 18, letterSpacing: 2 },
  btnCamaraSub: { color: '#78909C', fontSize: 13, marginTop: 6 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 22 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#2A3F4F' },
  dividerText: { color: '#546E7A', marginHorizontal: 15, fontSize: 13 },
  btnGaleria: {
    backgroundColor: '#1B2838', paddingVertical: 28, borderRadius: 24, alignItems: 'center',
    borderWidth: 1, borderColor: '#546E7A',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8,
  },
  btnGaleriaIcono: { fontSize: 40, marginBottom: 10 },
  btnGaleriaText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 17, letterSpacing: 1 },
  btnGaleriaSub: { color: '#78909C', fontSize: 13, marginTop: 6 },
  btnQR: {
    backgroundColor: '#004D40', paddingVertical: 28, borderRadius: 20, alignItems: 'center',
    borderWidth: 1, borderColor: '#00897B',
  },
  btnQRIcono: { fontSize: 36, marginBottom: 10, color: '#80CBC4' },
  btnQRText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
  btnQRSub: { color: '#80CBC4', fontSize: 13, marginTop: 6 },
  previaContainer: { width: '100%', alignItems: 'center' },
  paginasLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold', marginBottom: 10, alignSelf: 'flex-start' },
  paginasScroll: { maxHeight: 160, marginBottom: 15 },
  paginaMini: { width: 100, height: 140, borderRadius: 10, marginRight: 10, borderWidth: 1, borderColor: '#00BCD4' },
  paginaBorrar: { position: 'absolute', top: -6, right: 4, backgroundColor: '#EF5350', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  paginaBorrarText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 },
  row: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 18 },
  btnAgregar: { flex: 1, backgroundColor: '#37474F', paddingVertical: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#546E7A' },
  btnProcesar: { flex: 1, backgroundColor: '#00BCD4', paddingVertical: 18, borderRadius: 16, alignItems: 'center', elevation: 6, shadowColor: '#00BCD4', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8 },
  btnChicoText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15, letterSpacing: 1 },
  btnReiniciar: { marginTop: 10, paddingVertical: 12, alignItems: 'center' },
  btnReiniciarText: { color: '#78909C', fontSize: 13, textDecorationLine: 'underline' },
  loadingOverlay: { marginTop: 40, backgroundColor: 'rgba(0,188,212,0.12)', paddingVertical: 28, paddingHorizontal: 30, borderRadius: 20, borderWidth: 1, borderColor: '#00BCD4', alignItems: 'center', width: '100%' },
  loadingText: { marginTop: 12, color: '#00BCD4', fontSize: 15, fontWeight: '600' },
  resultados: { width: '100%', marginTop: 25 },
  resultadosHeader: { marginBottom: 15 },
  resultadosTitulo: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', letterSpacing: 1 },
  infoGrid: { backgroundColor: '#1B2838', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#2A3F4F', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8 },
  infoItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A3F4F' },
  infoLabel: { color: '#00BCD4', fontSize: 11, fontWeight: 'bold', letterSpacing: 1, marginBottom: 3 },
  infoValor: { color: '#FFFFFF', fontSize: 15 },
  totalCard: { backgroundColor: '#00BCD4', padding: 22, borderRadius: 20, alignItems: 'center', marginTop: 15, elevation: 8, shadowColor: '#00BCD4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
  totalLabel: { color: '#0D1B2A', fontSize: 12, fontWeight: 'bold', letterSpacing: 1, opacity: 0.8 },
  totalMonto: { color: '#0D1B2A', fontSize: 26, fontWeight: 'bold', marginTop: 4 },
  sectionTitulo: { fontSize: 17, fontWeight: 'bold', color: '#FFFFFF', marginTop: 25, marginBottom: 12 },
  card: { backgroundColor: '#1B2838', padding: 16, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#2A3F4F' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardNumero: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#00BCD4', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  cardNumeroText: { color: '#0D1B2A', fontWeight: 'bold', fontSize: 12 },
  cardDescripcion: { flex: 1, fontWeight: 'bold', fontSize: 14, color: '#FFFFFF' },
  cardDetalles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, marginLeft: 36 },
  cardTag: { backgroundColor: '#2A3F4F', color: '#B0BEC5', fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  cardPrecio: { color: '#78909C', fontSize: 13, marginLeft: 36 },
  cardSubtotal: { color: '#00BCD4', fontWeight: 'bold', fontSize: 14, marginLeft: 36, marginTop: 4 },
  noItemsCard: { backgroundColor: '#1B2838', padding: 25, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: '#2A3F4F' },
  noItemsText: { color: '#78909C', fontSize: 14 },
  rowBotones: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 20, marginBottom: 30 },
  btnPDF: { flex: 1, backgroundColor: '#E53935', paddingVertical: 20, borderRadius: 16, alignItems: 'center' },
  btnEnviar: { flex: 1, backgroundColor: '#00BCD4', paddingVertical: 20, borderRadius: 16, alignItems: 'center' },
  btnCarpeta: { backgroundColor: '#FF8F00', paddingVertical: 20, borderRadius: 16, alignItems: 'center', width: '100%', marginBottom: 10 },
  btnAccionText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
  captchaBanner: { backgroundColor: '#1B2838', padding: 16, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#F9A825', alignItems: 'center' },
  captchaBannerText: { color: '#FFE082', fontSize: 13, textAlign: 'center', marginBottom: 12 },
  btnCaptcha: { backgroundColor: '#F9A825', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  btnCaptchaText: { color: '#1B2838', fontWeight: 'bold', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  agregarModal: { backgroundColor: '#1B2838', marginHorizontal: 40, borderRadius: 20, padding: 24, alignItems: 'center' },
  agregarTitulo: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  agregarSub: { color: '#90A4AE', fontSize: 13, textAlign: 'center', marginBottom: 20 },
  agregarBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0D1B2A', paddingVertical: 16, paddingHorizontal: 20, borderRadius: 14, width: '100%' },
  agregarIcono: { fontSize: 22, marginRight: 14 },
  agregarTexto: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  agregarDivider: { height: 1, backgroundColor: '#2C3E50', width: '100%', marginVertical: 10 },
  agregarCancelar: { marginTop: 16, paddingVertical: 10 },
  agregarCancelarText: { color: '#78909C', fontSize: 14 },
  precioCambioRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 36, marginTop: 6 },
  precioCambioIcono: { fontSize: 16, fontWeight: 'bold', marginRight: 6 },
  precioCambioTexto: { fontSize: 12, fontWeight: '600' },
});
