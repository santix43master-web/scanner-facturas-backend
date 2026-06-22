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
      const result = await ImagePicker.launchCameraAsync({ quality: 0.3, allowsEditing: false, base64: false });
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
    if (fotos.length === 0) { Alert.alert("Error", "No hay fotos para procesar"); return; }
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
      Alert.alert("Error de conexion", `No se pudo procesar la factura.\n\nDetalles: ${error.message}`);
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
        Alert.alert("Producto encontrado", `Se encontraron ${json.resultados.length} registro(s). Revisá la pestaña Precios.`);
      } else {
        Alert.alert("Producto no encontrado", "Este producto aún no ha sido escaneado en ninguna factura.");
      }
    } catch (e) {
      Alert.alert("Error", `No se pudo buscar: ${e.message}`);
    }
  };

  const handleCaptchaDatos = async (data) => {
    setCaptchaCargando(true);
    try {
      const json = await procesarHtmlCompleto({
        html: data.html || '', url: data.url || '', de_data: data.de_data || null,
        qr_params: { qr: qrContentRef.current },
      }, urlServidor);
      if (json.error) throw new Error(json.error);
      if (!json.items || json.items.length === 0) throw new Error("sin items");
      setDatosFactura(prev => ({ ...prev, ...json }));
      const cambios = await actualizarPrecios(json);
      if (cambios) setCambiosPrecios(cambios);
      if (onFacturaProcesada) onFacturaProcesada(json);
      setCaptchaVisible(false);
    } catch (error) { setCaptchaCargando(false); }
  };

  const enviarARed = async () => {
    if (!datosFactura) { Alert.alert("Error", "No hay datos para enviar"); return; }
    try {
      setCargando(true);
      await guardarEnServidor(datosFactura, sucursalActual, urlServidor);
      Alert.alert("Enviado", `Factura guardada en buzon de ${sucursalActual}`);
      setFotos([]); setDatosFactura(null);
    } catch (error) {
      Alert.alert("Error de envio", `No se pudo guardar en el servidor.\n\nDetalles: ${error.message}`);
    } finally { setCargando(false); }
  };

  const enviarACarpetaAction = async () => {
    if (!datosFactura) { Alert.alert("Error", "No hay datos para enviar"); return; }
    try {
      setCargando(true);
      await guardarEnCarpeta(datosFactura, sucursalActual);
      Alert.alert("Guardado", `Factura enviada a carpeta compartida (${sucursalActual})`);
      setFotos([]); setDatosFactura(null);
    } catch (error) {
      Alert.alert("Error de red", `No se pudo conectar a la carpeta compartida.\n\nDetalles: ${error.message}`);
    } finally { setCargando(false); }
  };

  const generarPDFAction = async () => {
    if (!datosFactura) { Alert.alert("Aviso", "Primero procesa una factura"); return; }
    try {
      setCargando(true);
      const htmlContent = generarPDF(datosFactura, sucursalActual);
      const { uri } = await Print.printToFileAsync({ html: htmlContent, base64: false });
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Compartir Factura PDF', UTI: 'com.adobe.pdf' });
        Alert.alert("Listo", "PDF generado correctamente");
      } else {
        Alert.alert("PDF Creado", "El archivo se guardo correctamente.");
      }
    } catch (error) {
      Alert.alert("Error", `No se pudo generar el PDF: ${error.message}`);
    } finally { setCargando(false); }
  };

  return (
    <>
      {fotos.length === 0 ? (
        <View style={styles.menu}>
          <TouchableOpacity style={[styles.btnCamara, { backgroundColor: theme.surface, borderColor: theme.primary, shadowColor: theme.primary }]} onPress={tomarFoto} disabled={cargando} activeOpacity={0.85}>
            <Text style={styles.btnCamaraIcono}>📸</Text>
            <Text style={[styles.btnCamaraText, { color: theme.text }]}>CÁMARA</Text>
            <Text style={[styles.btnCamaraSub, { color: theme.textSecondary }]}>Escanear factura sin QR</Text>
          </TouchableOpacity>
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            <Text style={[styles.dividerText, { color: theme.textMuted }]}>O</Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          </View>
          <TouchableOpacity style={[styles.btnGaleria, { backgroundColor: theme.surface, borderColor: theme.textSecondary }]} onPress={seleccionarGaleria} disabled={cargando} activeOpacity={0.85}>
            <Text style={styles.btnGaleriaIcono}>🖼</Text>
            <Text style={[styles.btnGaleriaText, { color: theme.text }]}>GALERÍA</Text>
            <Text style={[styles.btnGaleriaSub, { color: theme.textSecondary }]}>Escanear factura sin QR</Text>
          </TouchableOpacity>
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            <Text style={[styles.dividerText, { color: theme.textMuted }]}>O</Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          </View>
          <TouchableOpacity style={[styles.btnQR, { backgroundColor: theme.surface, borderColor: theme.accent }]} onPress={() => { setQrActivo(true); qrScaneado.current = false; }} disabled={cargando} activeOpacity={0.85}>
            <Text style={[styles.btnQRIcono, { color: theme.primary }]}>▦</Text>
            <Text style={[styles.btnQRText, { color: theme.text }]}>QR / CÓDIGO DE BARRAS</Text>
            <Text style={[styles.btnQRSub, { color: theme.textSecondary }]}>Escanea QR de factura o código de barras de producto</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.previaContainer}>
          <Text style={[styles.paginasLabel, { color: theme.text }]}>Paginas ({fotos.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.paginasScroll}>
            {fotos.map((f, i) => (
              <TouchableOpacity key={i} onPress={() => {
                const nuevas = fotos.filter((_, idx) => idx !== i);
                setFotos(nuevas);
                if (nuevas.length === 0) setDatosFactura(null);
              }}>
                <Image source={{ uri: f }} style={[styles.paginaMini, { borderColor: theme.primary }]} />
                <View style={styles.paginaBorrar}><Text style={styles.paginaBorrarText}>X</Text></View>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btnAgregar, { backgroundColor: theme.cardTag, borderColor: theme.textSecondary }]} onPress={() => setModalAgregar(true)} disabled={cargando} activeOpacity={0.85}>
              <Text style={styles.btnChicoText}>+ AGREGAR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnProcesar, { backgroundColor: theme.primary }]} onPress={procesarIA} disabled={cargando} activeOpacity={0.85}>
              <Text style={styles.btnChicoText}>{cargando ? "PROCESANDO..." : `PROCESAR (${fotos.length})`}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.btnReiniciar} onPress={() => { setFotos([]); setDatosFactura(null); }} disabled={cargando}>
            <Text style={[styles.btnReiniciarText, { color: theme.textSecondary }]}>Cancelar y empezar de nuevo</Text>
          </TouchableOpacity>
        </View>
      )}

      {cargando && (
        <View style={[styles.loadingOverlay, { backgroundColor: theme.primary + '1F', borderColor: theme.primary }]}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.primary }]}>Procesando factura...</Text>
        </View>
      )}

      {datosFactura && (
        <View style={styles.resultados}>
          <View style={styles.resultadosHeader}>
            <Text style={[styles.resultadosTitulo, { color: theme.text }]}>DATOS DE LA FACTURA</Text>
          </View>
          <View style={[styles.infoGrid, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.infoItem, { borderBottomColor: theme.border }]}>
              <Text style={[styles.infoLabel, { color: theme.primary }]}>VENDEDOR</Text>
              <Text style={[styles.infoValor, { color: theme.text }]}>{datosFactura.nombreVendedor || 'No detectado'}</Text>
            </View>
            <View style={[styles.infoItem, { borderBottomColor: theme.border }]}>
              <Text style={[styles.infoLabel, { color: theme.primary }]}>RUC VENDEDOR</Text>
              <Text style={[styles.infoValor, { color: theme.text }]}>{datosFactura.rucVendedor || 'No detectado'}</Text>
            </View>
            <View style={[styles.infoItem, { borderBottomColor: theme.border }]}>
              <Text style={[styles.infoLabel, { color: theme.primary }]}>RUC COMPRADOR</Text>
              <Text style={[styles.infoValor, { color: theme.text }]}>{datosFactura.rucComprador || 'No detectado'}</Text>
            </View>
            <View style={[styles.infoItem, { borderBottomColor: theme.border }]}>
              <Text style={[styles.infoLabel, { color: theme.primary }]}>N° FACTURA</Text>
              <Text style={[styles.infoValor, { color: theme.text }]}>{datosFactura.numeroFactura || 'No detectado'}</Text>
            </View>
            <View style={[styles.infoItem, { borderBottomColor: theme.border }]}>
              <Text style={[styles.infoLabel, { color: theme.primary }]}>TIMBRADO</Text>
              <Text style={[styles.infoValor, { color: theme.text }]}>{datosFactura.timbrado || 'No detectado'}</Text>
            </View>
            <View style={[styles.infoItem, { borderBottomColor: theme.border }]}>
              <Text style={[styles.infoLabel, { color: theme.primary }]}>FECHA EMISION</Text>
              <Text style={[styles.infoValor, { color: theme.text }]}>{datosFactura.fechaEmision || 'No detectado'}</Text>
            </View>
          </View>
          <View style={[styles.totalCard, { backgroundColor: theme.primary }]}>
            <Text style={[styles.totalLabel, { color: theme.totalCardText }]}>TOTAL GENERAL</Text>
            <Text style={[styles.totalMonto, { color: theme.totalCardText }]}>
              {datosFactura.totalGeneral ? datosFactura.totalGeneral.toLocaleString('es-PY') : 0} Gs.
            </Text>
          </View>
          {(!datosFactura.items || datosFactura.items.length === 0) && datosFactura.fuente !== "SIFEN/KUDE QR" && (
            <View style={[styles.captchaBanner, { backgroundColor: theme.surface, borderColor: theme.warning }]}>
              <Text style={[styles.captchaBannerText, { color: theme.warningText }]}>No se pudieron obtener los artículos automáticamente. Resolvé el captcha en el portal de SIFEN para acceder a los datos completos.</Text>
              <TouchableOpacity style={[styles.btnCaptcha, { backgroundColor: theme.warning }]} onPress={() => setCaptchaVisible(true)} activeOpacity={0.85}>
                <Text style={[styles.btnCaptchaText, { color: theme.surface }]}>RESOLVER CAPTCHA</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={[styles.sectionTitulo, { color: theme.text }]}>Articulos Extraidos ({datosFactura.items?.length || 0})</Text>
          {datosFactura.items && datosFactura.items.length > 0 ? (
            datosFactura.items.map((it, idx) => {
              const cambio = cambiosPrecios.find(c => c.codigo === it.codigo || c.codigo === it.codigo_barras);
              return (
                <View key={idx} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.cardNumero, { backgroundColor: theme.primary }]}><Text style={[styles.cardNumeroText, { color: theme.badgeText }]}>{idx + 1}</Text></View>
                    <Text style={[styles.cardDescripcion, { color: theme.text }]} numberOfLines={2}>{it.descripcion || "Sin descripcion"}</Text>
                  </View>
                  <View style={styles.cardDetalles}>
                    {it.codigo ? <Text style={[styles.cardTag, { backgroundColor: theme.cardTag, color: theme.cardTagText }]}>Cod: {it.codigo}</Text> : null}
                    {it.codigo_barras ? <Text style={[styles.cardTag, { backgroundColor: theme.cardTag, color: theme.cardTagText }]}>EAN: {it.codigo_barras}</Text> : null}
                    <Text style={[styles.cardPrecio, { color: theme.textSecondary }]}>{it.cantidad || 1} x {Number(it.precio_unitario || 0).toLocaleString('es-PY')} Gs.</Text>
                  </View>
                  <Text style={[styles.cardSubtotal, { color: theme.primary }]}>Subtotal: {it.subtotal ? it.subtotal.toLocaleString('es-PY') : 0} Gs.</Text>
                  {cambio && !cambio.esPrimeraVez ? (
                    <View style={styles.precioCambioRow}>
                      <Text style={[styles.precioCambioIcono, { color: cambio.diferencia > 0 ? theme.danger : theme.success }]}>{cambio.diferencia > 0 ? '↑' : '↓'}</Text>
                      <Text style={[styles.precioCambioTexto, { color: cambio.diferencia > 0 ? theme.danger : theme.success }]}>
                        {Number(cambio.precioAnterior).toLocaleString('es-PY')} Gs → {Number(cambio.precioActual).toLocaleString('es-PY')} Gs ({cambio.porcentaje}%)
                      </Text>
                    </View>
                  ) : null}
                  {cambio && cambio.esPrimeraVez ? (
                    <View style={styles.precioCambioRow}>
                      <Text style={[styles.precioCambioIcono, { color: theme.textMuted }]}>●</Text>
                      <Text style={[styles.precioCambioTexto, { color: theme.textMuted }]}>Primera vez que se escanea</Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          ) : (
            <View style={[styles.noItemsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.noItemsText, { color: theme.textSecondary }]}>No se detectaron articulos</Text>
            </View>
          )}
          <View style={styles.rowBotones}>
            <TouchableOpacity style={[styles.btnPDF, { backgroundColor: theme.danger }]} onPress={generarPDFAction} disabled={cargando} activeOpacity={0.85}>
              <Text style={styles.btnAccionText}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btnEnviar, { backgroundColor: theme.primary }]} onPress={enviarARed} disabled={cargando} activeOpacity={0.85}>
              <Text style={styles.btnAccionText}>ENVIAR</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.btnCarpeta, { backgroundColor: theme.warning }]} onPress={enviarACarpetaAction} disabled={cargando} activeOpacity={0.85}>
            <Text style={styles.btnAccionText}>CARPETA COMPARTIDA</Text>
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

      <Modal visible={modalAgregar} transparent={true} animationType="fade" onRequestClose={() => setModalAgregar(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.agregarModal, { backgroundColor: theme.surface }]}>
            <Text style={[styles.agregarTitulo, { color: theme.text }]}>Agregar página</Text>
            <Text style={[styles.agregarSub, { color: theme.textSecondary }]}>Elegí cómo querés capturar la siguiente página</Text>
            <TouchableOpacity style={[styles.agregarBtn, { backgroundColor: theme.background }]} onPress={() => { setModalAgregar(false); tomarFoto(); }} activeOpacity={0.85}>
              <Text style={styles.agregarIcono}>📸</Text>
              <Text style={[styles.agregarTexto, { color: theme.text }]}>CÁMARA</Text>
            </TouchableOpacity>
            <View style={[styles.agregarDivider, { backgroundColor: theme.border }]} />
            <TouchableOpacity style={[styles.agregarBtn, { backgroundColor: theme.background }]} onPress={() => { setModalAgregar(false); seleccionarGaleria(); }} activeOpacity={0.85}>
              <Text style={styles.agregarIcono}>🖼</Text>
              <Text style={[styles.agregarTexto, { color: theme.text }]}>GALERÍA</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.agregarCancelar} onPress={() => setModalAgregar(false)}>
              <Text style={[styles.agregarCancelarText, { color: theme.textSecondary }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  menu: { width: '100%', marginTop: 30 },
  btnCamara: { paddingVertical: 32, borderRadius: 24, alignItems: 'center', borderWidth: 1, elevation: 8, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 },
  btnCamaraIcono: { fontSize: 44, marginBottom: 10 },
  btnCamaraText: { fontWeight: 'bold', fontSize: 18, letterSpacing: 2 },
  btnCamaraSub: { fontSize: 13, marginTop: 6 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 22 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 15, fontSize: 13 },
  btnGaleria: { paddingVertical: 28, borderRadius: 24, alignItems: 'center', borderWidth: 1, elevation: 4, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8 },
  btnGaleriaIcono: { fontSize: 40, marginBottom: 10 },
  btnGaleriaText: { fontWeight: 'bold', fontSize: 17, letterSpacing: 1 },
  btnGaleriaSub: { fontSize: 13, marginTop: 6 },
  btnQR: { paddingVertical: 28, borderRadius: 20, alignItems: 'center', borderWidth: 1 },
  btnQRIcono: { fontSize: 36, marginBottom: 10 },
  btnQRText: { fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
  btnQRSub: { fontSize: 13, marginTop: 6 },
  previaContainer: { width: '100%', alignItems: 'center' },
  paginasLabel: { fontSize: 14, fontWeight: 'bold', marginBottom: 10, alignSelf: 'flex-start' },
  paginasScroll: { maxHeight: 160, marginBottom: 15 },
  paginaMini: { width: 100, height: 140, borderRadius: 10, marginRight: 10, borderWidth: 1 },
  paginaBorrar: { position: 'absolute', top: -6, right: 4, backgroundColor: '#EF5350', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  paginaBorrarText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 },
  row: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 18 },
  btnAgregar: { flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1 },
  btnProcesar: { flex: 1, paddingVertical: 18, borderRadius: 16, alignItems: 'center', elevation: 6, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 8 },
  btnChicoText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15, letterSpacing: 1 },
  btnReiniciar: { marginTop: 10, paddingVertical: 12, alignItems: 'center' },
  btnReiniciarText: { fontSize: 13, textDecorationLine: 'underline' },
  loadingOverlay: { marginTop: 40, paddingVertical: 28, paddingHorizontal: 30, borderRadius: 20, borderWidth: 1, alignItems: 'center', width: '100%' },
  loadingText: { marginTop: 12, fontSize: 15, fontWeight: '600' },
  resultados: { width: '100%', marginTop: 25 },
  resultadosHeader: { marginBottom: 15 },
  resultadosTitulo: { fontSize: 20, fontWeight: 'bold', letterSpacing: 1 },
  infoGrid: { borderRadius: 20, padding: 18, borderWidth: 1, elevation: 4, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8 },
  infoItem: { paddingVertical: 10, borderBottomWidth: 1 },
  infoLabel: { fontSize: 11, fontWeight: 'bold', letterSpacing: 1, marginBottom: 3 },
  infoValor: { fontSize: 15 },
  totalCard: { padding: 22, borderRadius: 20, alignItems: 'center', marginTop: 15, elevation: 8, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
  totalLabel: { fontSize: 12, fontWeight: 'bold', letterSpacing: 1, opacity: 0.8 },
  totalMonto: { fontSize: 26, fontWeight: 'bold', marginTop: 4 },
  sectionTitulo: { fontSize: 17, fontWeight: 'bold', marginTop: 25, marginBottom: 12 },
  card: { padding: 16, borderRadius: 14, marginBottom: 10, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardNumero: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  cardNumeroText: { fontWeight: 'bold', fontSize: 12 },
  cardDescripcion: { flex: 1, fontWeight: 'bold', fontSize: 14 },
  cardDetalles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, marginLeft: 36 },
  cardTag: { fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  cardPrecio: { fontSize: 13, marginLeft: 36 },
  cardSubtotal: { fontWeight: 'bold', fontSize: 14, marginLeft: 36, marginTop: 4 },
  noItemsCard: { padding: 25, borderRadius: 14, alignItems: 'center', borderWidth: 1 },
  noItemsText: { fontSize: 14 },
  rowBotones: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 20, marginBottom: 30 },
  btnPDF: { flex: 1, paddingVertical: 20, borderRadius: 16, alignItems: 'center' },
  btnEnviar: { flex: 1, paddingVertical: 20, borderRadius: 16, alignItems: 'center' },
  btnCarpeta: { paddingVertical: 20, borderRadius: 16, alignItems: 'center', width: '100%', marginBottom: 10 },
  btnAccionText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
  captchaBanner: { padding: 16, borderRadius: 12, marginBottom: 15, borderWidth: 1, alignItems: 'center' },
  captchaBannerText: { fontSize: 13, textAlign: 'center', marginBottom: 12 },
  btnCaptcha: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  btnCaptchaText: { fontWeight: 'bold', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  agregarModal: { marginHorizontal: 40, borderRadius: 20, padding: 24, alignItems: 'center' },
  agregarTitulo: { fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  agregarSub: { fontSize: 13, textAlign: 'center', marginBottom: 20 },
  agregarBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20, borderRadius: 14, width: '100%' },
  agregarIcono: { fontSize: 22, marginRight: 14 },
  agregarTexto: { fontSize: 16, fontWeight: '600' },
  agregarDivider: { height: 1, width: '100%', marginVertical: 10 },
  agregarCancelar: { marginTop: 16, paddingVertical: 10 },
  agregarCancelarText: { fontSize: 14 },
  precioCambioRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 36, marginTop: 6 },
  precioCambioIcono: { fontSize: 16, fontWeight: 'bold', marginRight: 6 },
  precioCambioTexto: { fontSize: 12, fontWeight: '600' },
});
