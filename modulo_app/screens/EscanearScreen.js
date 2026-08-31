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
    if (status !== 'granted') { Alert.alert("Permiso denegado", "Necesitamos acceso a la cámara"); return; }
    try {
      const result = await ImagePicker.launchCameraAsync({ quality: 0.3, allowsEditing: false, base64: false });
      if (!result.canceled && result.assets?.length > 0) {
        setFotos(prev => [...prev, result.assets[0].uri]);
        setDatosFactura(null);
      }
    } catch { Alert.alert('Error', 'No se pudo abrir la cámara'); }
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
    if (fotos.length === 0) { Alert.alert("Sin fotos", "Primero tomá o seleccioná una foto"); return; }
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
      Alert.alert("Error de conexión", `No se pudo procesar la factura.\n${error.message}`);
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
        Alert.alert("Producto no encontrado", "Este código aún no ha sido escaneado en ninguna factura.");
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
      setDatosFactura(prev => prev ? { ...prev, ...json } : json);
      const cambios = await actualizarPrecios(json);
      if (cambios) setCambiosPrecios(cambios);
      if (onFacturaProcesada) onFacturaProcesada(json);
      setCaptchaVisible(false);
    } catch (error) { setCaptchaCargando(false); Alert.alert("Error captcha", "No se pudieron extraer los datos. Intentá de nuevo."); }
  };

  const enviarARed = async () => {
    if (!datosFactura) { Alert.alert("Sin datos", "No hay factura para enviar"); return; }
    try {
      setCargando(true);
      await guardarEnServidor(datosFactura, sucursalActual, urlServidor);
      Alert.alert("Enviado", `Factura guardada en buzón de ${sucursalActual}`);
      setFotos([]); setDatosFactura(null);
    } catch (error) {
      Alert.alert("Error de envío", `No se pudo guardar en el servidor.\n${error.message}`);
    } finally { setCargando(false); }
  };

  const enviarACarpetaAction = async () => {
    if (!datosFactura) { Alert.alert("Sin datos", "No hay factura para enviar"); return; }
    try {
      setCargando(true);
      await guardarEnCarpeta(datosFactura, sucursalActual);
      Alert.alert("Guardado", `Factura enviada a carpeta compartida (${sucursalActual})`);
      setFotos([]); setDatosFactura(null);
    } catch (error) {
      Alert.alert("Error de red", `No se pudo conectar a la carpeta compartida.\n${error.message}`);
    } finally { setCargando(false); }
  };

  const generarPDFAction = async () => {
    if (!datosFactura) { Alert.alert("Aviso", "Primero procesá una factura"); return; }
    try {
      setCargando(true);
      const htmlContent = generarPDF(datosFactura, sucursalActual);
      const { uri } = await Print.printToFileAsync({ html: htmlContent, base64: false });
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Compartir Factura PDF', UTI: 'com.adobe.pdf' });
        Alert.alert("Listo", "PDF generado correctamente");
      } else {
        Alert.alert("PDF Creado", "El archivo se guardó correctamente.");
      }
    } catch (error) {
      Alert.alert("Error", `No se pudo generar el PDF: ${error.message}`);
    } finally { setCargando(false); }
  };

  return (
    <>
      {fotos.length === 0 ? (
        <View style={[styles.menuContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.menuTitle, { color: theme.text }]}>¿Cómo querés escanear?</Text>
          <TouchableOpacity style={[styles.menuBtn, { backgroundColor: theme.background, borderColor: theme.primary }]} onPress={tomarFoto} disabled={cargando} activeOpacity={0.85}>
            <Text style={[styles.menuBtnIcon, { color: theme.primary }]}>📸</Text>
            <Text style={[styles.menuBtnTitle, { color: theme.text }]}>Cámara</Text>
            <Text style={[styles.menuBtnSub, { color: theme.textMuted }]}>Fotografiá la factura</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuBtn, { backgroundColor: theme.background, borderColor: theme.textSecondary }]} onPress={seleccionarGaleria} disabled={cargando} activeOpacity={0.85}>
            <Text style={[styles.menuBtnIcon, { color: theme.textSecondary }]}>🖼</Text>
            <Text style={[styles.menuBtnTitle, { color: theme.text }]}>Galería</Text>
            <Text style={[styles.menuBtnSub, { color: theme.textMuted }]}>Seleccioná desde el dispositivo</Text>
          </TouchableOpacity>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <TouchableOpacity style={[styles.menuBtn, { backgroundColor: theme.background, borderColor: theme.accent }]} onPress={() => { setQrActivo(true); qrScaneado.current = false; }} disabled={cargando} activeOpacity={0.85}>
            <Text style={[styles.menuBtnIcon, { color: theme.primary }]}>▦</Text>
            <Text style={[styles.menuBtnTitle, { color: theme.text }]}>QR / Código de barras</Text>
            <Text style={[styles.menuBtnSub, { color: theme.textMuted }]}>Escaneá el código QR de la factura o el código de barras de un producto</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.previaWrap}>
          <View style={styles.previaTop}>
            <Text style={[styles.previaCount, { color: theme.textSecondary }]}>{fotos.length} página(s)</Text>
            <TouchableOpacity onPress={() => { setFotos([]); setDatosFactura(null); }} disabled={cargando}>
              <Text style={[styles.previaCancel, { color: theme.textMuted }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previaScroll}>
            {fotos.map((f, i) => (
              <TouchableOpacity key={i} onPress={() => {
                const nuevas = fotos.filter((_, idx) => idx !== i);
                setFotos(nuevas);
                if (nuevas.length === 0) setDatosFactura(null);
              }}>
                <Image source={{ uri: f }} style={[styles.previaImg, { borderColor: theme.primary }]} />
                <View style={styles.previaDel}><Text style={styles.previaDelText}>✕</Text></View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.previaAdd, { borderColor: theme.border }]} onPress={async () => {
              Alert.alert("Agregar página", "", [
                { text: "Cámara", onPress: tomarFoto },
                { text: "Galería", onPress: seleccionarGaleria },
                { text: "Cancelar", style: "cancel" },
              ]);
            }}>
              <Text style={[styles.previaAddIcon, { color: theme.textMuted }]}>+</Text>
            </TouchableOpacity>
          </ScrollView>
          <TouchableOpacity style={[styles.procesarBtn, { backgroundColor: theme.primary }]} onPress={procesarIA} disabled={cargando} activeOpacity={0.85}>
            {cargando ? (
              <ActivityIndicator size="small" color={theme.totalCardText} />
            ) : (
              <Text style={[styles.procesarBtnText, { color: theme.totalCardText }]}>PROCESAR ({fotos.length})</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {cargando && (
        <View style={[styles.loadingBox, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.primary }]}>Procesando factura...</Text>
        </View>
      )}

      {datosFactura && (
        <View style={styles.resultadosWrap}>
          <Text style={[styles.resultTitle, { color: theme.text }]}>Factura</Text>

          <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {[
              { label: 'Vendedor', val: datosFactura.nombreVendedor },
              { label: 'RUC Vendedor', val: datosFactura.rucVendedor },
              { label: 'RUC Comprador', val: datosFactura.rucComprador },
              { label: 'N° Factura', val: datosFactura.numeroFactura },
              { label: 'Timbrado', val: datosFactura.timbrado },
              { label: 'Emisión', val: datosFactura.fechaEmision },
            ].map((d, i) => (
              <View key={i} style={[styles.infoRow, i < 5 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                <Text style={[styles.infoLabel, { color: theme.primary }]}>{d.label}</Text>
                <Text style={[styles.infoValue, { color: theme.text }]}>{d.val || '—'}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.totalCard, { backgroundColor: theme.primary }]}>
            <Text style={[styles.totalLabel, { color: theme.totalCardText }]}>TOTAL GENERAL</Text>
            <Text style={[styles.totalMonto, { color: theme.totalCardText }]}>
              {(datosFactura.totalGeneral || 0).toLocaleString('es-PY')} Gs.
            </Text>
          </View>

          {(!datosFactura.items || datosFactura.items.length === 0) && datosFactura.fuente !== "SIFEN/KUDE QR" && (
            <View style={[styles.captchaBanner, { backgroundColor: theme.warningBg, borderColor: theme.warning }]}>
              <Text style={[styles.captchaText, { color: theme.warningText }]}>
                No se pudieron obtener los artículos automáticamente. Resolvé el captcha en SIFEN para acceder a los datos completos.
              </Text>
              <TouchableOpacity style={[styles.captchaBtn, { backgroundColor: theme.warning }]} onPress={() => setCaptchaVisible(true)} activeOpacity={0.85}>
                <Text style={[styles.captchaBtnText, { color: theme.totalCardText }]}>RESOLVER CAPTCHA</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={[styles.resultTitle, { color: theme.text, marginTop: 24 }]}>
            Artículos ({datosFactura.items?.length || 0})
          </Text>

          {datosFactura.items && datosFactura.items.length > 0 ? (
            datosFactura.items.map((it, idx) => {
              const cambio = cambiosPrecios.find(c => c.codigo === it.codigo || c.codigo === it.codigo_barras);
              return (
                <View key={idx} style={[styles.itemCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={styles.itemHeader}>
                    <View style={[styles.itemNum, { backgroundColor: theme.primary }]}>
                      <Text style={[styles.itemNumText, { color: theme.totalCardText }]}>{idx + 1}</Text>
                    </View>
                    <Text style={[styles.itemDesc, { color: theme.text }]} numberOfLines={2}>{it.descripcion || 'Sin descripción'}</Text>
                  </View>
                  <View style={styles.itemTags}>
                    {it.codigo ? <Text style={[styles.itemTag, { backgroundColor: theme.cardTag, color: theme.cardTagText }]}>Cód: {it.codigo}</Text> : null}
                    {it.codigo_barras ? <Text style={[styles.itemTag, { backgroundColor: theme.cardTag, color: theme.cardTagText }]}>EAN: {it.codigo_barras}</Text> : null}
                  </View>
                  <Text style={[styles.itemQty, { color: theme.textSecondary }]}>{it.cantidad || 1} × {Number(it.precio_unitario || 0).toLocaleString('es-PY')} Gs.</Text>
                  <Text style={[styles.itemSub, { color: theme.primary }]}>{(it.subtotal || 0).toLocaleString('es-PY')} Gs.</Text>
                  {cambio && !cambio.esPrimeraVez && (
                    <View style={[styles.cambioBadge, { backgroundColor: cambio.diferencia > 0 ? theme.danger + '20' : theme.success + '20' }]}>
                      <Text style={[styles.cambioText, { color: cambio.diferencia > 0 ? theme.danger : theme.success }]}>
                        {cambio.diferencia > 0 ? '↑' : '↓'} {Number(cambio.precioAnterior).toLocaleString('es-PY')} → {Number(cambio.precioActual).toLocaleString('es-PY')} Gs ({cambio.porcentaje}%)
                      </Text>
                    </View>
                  )}
                  {cambio && cambio.esPrimeraVez && (
                    <View style={[styles.cambioBadge, { backgroundColor: theme.cardTag }]}>
                      <Text style={[styles.cambioText, { color: theme.cardTagText }]}>● Primera vez que se escanea</Text>
                    </View>
                  )}
                </View>
              );
            })
          ) : (
            <View style={[styles.noItems, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.noItemsText, { color: theme.textMuted }]}>No se detectaron artículos</Text>
            </View>
          )}

          <View style={styles.actionsWrap}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.danger }]} onPress={generarPDFAction} disabled={cargando} activeOpacity={0.85}>
              <Text style={styles.actionBtnText}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.primary }]} onPress={enviarARed} disabled={cargando} activeOpacity={0.85}>
              <Text style={styles.actionBtnText}>ENVIAR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.accent }]} onPress={enviarACarpetaAction} disabled={cargando} activeOpacity={0.85}>
              <Text style={styles.actionBtnText}>CARPETA</Text>
            </TouchableOpacity>
          </View>
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
  menuContainer: { width: '100%', padding: 20, borderRadius: 20, borderWidth: 1, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 16 },
  menuTitle: { fontSize: 18, fontWeight: '700', marginBottom: 18, textAlign: 'center' },
  menuBtn: { padding: 20, borderRadius: 16, marginBottom: 10, borderWidth: 1, alignItems: 'center' },
  menuBtnIcon: { fontSize: 28, marginBottom: 6 },
  menuBtnTitle: { fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  menuBtnSub: { fontSize: 12, marginTop: 4, textAlign: 'center' },
  divider: { height: 1, marginVertical: 6 },
  previaWrap: { width: '100%' },
  previaTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  previaCount: { fontSize: 14, fontWeight: '600' },
  previaCancel: { fontSize: 14 },
  previaScroll: { maxHeight: 150, marginBottom: 16 },
  previaImg: { width: 90, height: 130, borderRadius: 10, marginRight: 8, borderWidth: 2 },
  previaDel: { position: 'absolute', top: -8, right: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: '#FF5252', justifyContent: 'center', alignItems: 'center' },
  previaDelText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  previaAdd: { width: 90, height: 130, borderRadius: 10, borderWidth: 2, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  previaAddIcon: { fontSize: 30 },
  procesarBtn: { paddingVertical: 18, borderRadius: 16, alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
  procesarBtnText: { fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  loadingBox: { marginTop: 24, paddingVertical: 28, paddingHorizontal: 30, borderRadius: 16, borderWidth: 1, alignItems: 'center', width: '100%' },
  loadingText: { marginTop: 12, fontSize: 15, fontWeight: '600' },
  resultadosWrap: { width: '100%', marginTop: 24 },
  resultTitle: { fontSize: 22, fontWeight: '800', marginBottom: 14 },
  infoCard: { borderRadius: 16, padding: 16, borderWidth: 1, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
  infoRow: { paddingVertical: 10, paddingHorizontal: 4 },
  infoLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
  infoValue: { fontSize: 15, fontWeight: '500' },
  totalCard: { padding: 24, borderRadius: 16, alignItems: 'center', marginTop: 16, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
  totalLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, opacity: 0.8 },
  totalMonto: { fontSize: 28, fontWeight: '800', marginTop: 4 },
  captchaBanner: { padding: 18, borderRadius: 14, marginTop: 16, borderWidth: 1, alignItems: 'center' },
  captchaText: { fontSize: 13, textAlign: 'center', marginBottom: 14, lineHeight: 18 },
  captchaBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 25 },
  captchaBtnText: { fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  itemCard: { padding: 16, borderRadius: 14, marginBottom: 8, borderWidth: 1, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  itemNum: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  itemNumText: { fontWeight: '800', fontSize: 12 },
  itemDesc: { flex: 1, fontWeight: '600', fontSize: 14 },
  itemTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 36, marginBottom: 6 },
  itemTag: { fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, fontWeight: '600' },
  itemQty: { fontSize: 13, marginLeft: 36 },
  itemSub: { fontWeight: '700', fontSize: 15, marginLeft: 36, marginTop: 4 },
  cambioBadge: { marginLeft: 36, marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  cambioText: { fontSize: 11, fontWeight: '700' },
  noItems: { padding: 24, borderRadius: 14, alignItems: 'center', borderWidth: 1 },
  noItemsText: { fontSize: 14 },
  actionsWrap: { flexDirection: 'row', gap: 10, marginTop: 24, marginBottom: 32 },
  actionBtn: { flex: 1, paddingVertical: 18, borderRadius: 14, alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6 },
  actionBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13, letterSpacing: 1 },
});
