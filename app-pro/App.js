import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, StyleSheet, Image, Modal, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as InAppPurchases from 'expo-in-app-purchases';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BACKEND = 'https://scanner-facturas-backend.onrender.com';

const PLANES = [
  { id: 'scanfact_100', nombre: 'Básico', precio: '$25/mes', escaneos: 100, sku: 'scanfact_100' },
  { id: 'scanfact_350', nombre: 'Profesional', precio: '$65/mes', escaneos: 350, sku: 'scanfact_350' },
  { id: 'scanfact_900', nombre: 'Premium', precio: '$135/mes', escaneos: 900, sku: 'scanfact_900' },
];

const IAP_ENABLED = Platform.OS === 'android';

export default function App() {
  const [paso, setPaso] = useState('cargando');
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', negocio: '' });
  const [planActivo, setPlanActivo] = useState(null); // { id, nombre, escaneos, vence }
  const [scansUsados, setScansUsados] = useState(0);
  const [scansRestantes, setScansRestantes] = useState(0);
  const [foto, setFoto] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [modalPlanes, setModalPlanes] = useState(false);
  const [modalExport, setModalExport] = useState(false);
  const [comprando, setComprando] = useState(false);
  const iapReady = useRef(false);

  const [esModoDemo, setEsModoDemo] = useState(false);

  useEffect(() => { cargarEstado(); return () => { if (iapReady.current) InAppPurchases.disconnectAsync().catch(() => {}); }; }, []);

  const cargarEstado = async () => {
    try {
      const u = await AsyncStorage.getItem('@scanfact_user');
      if (u) {
        setUser(JSON.parse(u));
        await cargarSuscripcion();
      } else {
        setPaso('registro');
      }
    } catch { setPaso('registro'); }
  };

  const iniciarIAP = async () => {
    if (iapReady.current) return;
    try {
      await InAppPurchases.connectAsync();
      const products = await InAppPurchases.getProductsAsync(PLANES.map(p => p.sku));
      if (!products?.length) throw new Error('Sin productos');
      iapReady.current = true;
      const history = await InAppPurchases.getPurchaseHistoryAsync();
      if (history?.length > 0) {
        const p = history[history.length - 1];
        const plan = PLANES.find(x => x.sku === p.productId);
        if (plan) {
          const datos = { id: plan.id, nombre: plan.nombre, escaneos: plan.escaneos, vence: Date.now() + 30 * 24 * 60 * 60 * 1000 };
          setPlanActivo(datos);
          await AsyncStorage.setItem('@scanfact_plan', JSON.stringify(datos));
        }
      }
      InAppPurchases.setPurchaseListener(({ responseCode, results, errorCode }) => {
        if (responseCode === InAppPurchases.IAPResponseCode.OK && results?.length > 0) {
          for (const r of results) { if (r.productId) finalizarCompra(r.productId); }
        } else if (responseCode === InAppPurchases.IAPResponseCode.USER_CANCELED) {
          setComprando(false);
        } else {
          setComprando(false);
        }
      });
    } catch {
      // Google Play no disponible → modo demo
      setEsModoDemo(true);
    }
  };

  const cargarSuscripcion = async () => {
    const p = await AsyncStorage.getItem('@scanfact_plan');
    if (p) {
      const plan = JSON.parse(p);
      setPlanActivo(plan);
    }
    const s = await AsyncStorage.getItem('@scanfact_scans');
    setScansUsados(s ? parseInt(s) : 0);
    const h = await AsyncStorage.getItem('@scanfact_historial');
    if (h) setHistorial(JSON.parse(h));
    setPaso('scan');
    if (IAP_ENABLED) iniciarIAP();
  };

  const finalizarCompra = async (productId) => {
    const plan = PLANES.find(x => x.sku === productId);
    if (!plan) return;
    const datos = { id: plan.id, nombre: plan.nombre, escaneos: plan.escaneos, vence: Date.now() + 30 * 24 * 60 * 60 * 1000 };
    setPlanActivo(datos);
    setScansUsados(0);
    await AsyncStorage.setItem('@scanfact_plan', JSON.stringify(datos));
    await AsyncStorage.setItem('@scanfact_scans', '0');
    await AsyncStorage.setItem('@scanfact_vence', datos.vence.toString());
    setComprando(false);
    setModalPlanes(false);
    Alert.alert('✅ Suscripción activa', `Plan ${plan.nombre} activado. ${plan.escaneos} escaneos por mes.`);
  };

  useEffect(() => {
    if (planActivo && planActivo.vence) {
      const restantes = planActivo.escaneos - scansUsados;
      setScansRestantes(Math.max(0, restantes));
      if (Date.now() > planActivo.vence) {
        Alert.alert('Plan vencido', 'Tu suscripción se renovará automáticamente con Google Play.');
      }
    } else {
      setScansRestantes(0);
    }
  }, [planActivo, scansUsados]);

  const registrar = async () => {
    const { nombre, email, telefono, negocio } = form;
    if (!nombre.trim() || !email.trim() || !telefono.trim()) {
      Alert.alert('Error', 'Completá nombre, email y teléfono'); return;
    }
    const userData = { ...form, fecha: new Date().toISOString(), id: Date.now().toString() };
    await AsyncStorage.setItem('@scanfact_user', JSON.stringify(userData));
    setUser(userData);
    setPaso('planes');
  };

  const seleccionarPlan = async (sku) => {
    const plan = PLANES.find(x => x.sku === sku);
    if (!plan) return;
    if (esModoDemo) {
      await finalizarCompra(sku);
      return;
    }
    setComprando(true);
    try {
      await InAppPurchases.purchaseProductAsync(sku);
    } catch {
      setComprando(false);
      await finalizarCompra(sku); // fallback a demo
    }
  };

  const tomarFoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso', 'Necesitamos acceso a la cámara'); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!res.canceled) setFoto(res.assets[0]);
  };

  const seleccionarFoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso', 'Necesitamos acceso a la galería'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!res.canceled) setFoto(res.assets[0]);
  };

  const procesarFactura = async () => {
    if (!foto) { Alert.alert('Error', 'Tomá o seleccioná una foto'); return; }
    if (!user?.negocio?.trim()) { Alert.alert('Error', 'Ingresá tu negocio/sucursal en Config'); return; }
    if (!planActivo) { Alert.alert('Sin plan', 'Elegí un plan de suscripción primero'); setModalPlanes(true); return; }
    if (scansRestantes <= 0) {
      Alert.alert('Sin escaneos', 'Llegaste al límite mensual. Esperá a que se renueve o cambiá de plan.', [
        { text: 'Ver planes', onPress: () => setModalPlanes(true) }, { text: 'Cancelar' },
      ]);
      return;
    }
    setProcesando(true);
    setResultado(null);
    try {
      const formData = new FormData();
      formData.append('factura', { uri: foto.uri, type: 'image/jpeg', name: 'factura.jpg' });
      formData.append('sucursal', user.negocio.trim());
      const r = await fetch(`${API_BACKEND}/procesar`, { method: 'POST', body: formData });
      const d = await r.json();
      if (d.error) { Alert.alert('Error', d.error); return; }

      const nuevos = scansUsados + 1;
      setScansUsados(nuevos);
      await AsyncStorage.setItem('@scanfact_scans', nuevos.toString());

      setResultado(d);
      const entrada = {
        id: Date.now(), vendedor: d.nombreVendedor || '?', total: d.totalGeneral || 0,
        fecha: d.fechaEmision || '?', numero: d.numeroFactura || '?', items: d.items || [],
      };
      const nuevoH = [entrada, ...historial];
      setHistorial(nuevoH);
      await AsyncStorage.setItem('@scanfact_historial', JSON.stringify(nuevoH.slice(0, 50)));
      setFoto(null);
    } catch (e) { Alert.alert('Error', e.message); }
    setProcesando(false);
  };

  const exportarExcel = async () => {
    try {
      const r = await fetch(`${API_BACKEND}/historial/${encodeURIComponent(user.negocio.trim().replace(' ', '_'))}`);
      const data = await r.json();
      const facturas = data.facturas || [];
      if (facturas.length === 0) { Alert.alert('Sin datos', 'No hay facturas'); return; }
      const filas = facturas.map(f => (f.items || []).map(it =>
        `"${f.numeroFactura || ''}","${f.fechaEmision || ''}","${f.nombreVendedor || ''}","${it.descripcion || ''}","${it.codigo || ''}",${it.cantidad || 1},${Number(it.precio_unitario || 0)},${Number(it.subtotal || 0)}`
      ).join('\n')).filter(Boolean).join('\n');
      const csv = 'Factura,Fecha,Vendedor,Articulo,Codigo,Cantidad,Precio,Subtotal\n' + filas;
      const path = FileSystem.cacheDirectory + 'facturas.csv';
      await FileSystem.writeAsStringAsync(path, '\uFEFF' + csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: 'text/csv' });
    } catch { Alert.alert('Error', 'No se pudieron exportar'); }
    setModalExport(false);
  };

  const exportarJSON = async () => {
    try {
      const skey = user.negocio.trim().replace(' ', '_');
      const r = await fetch(`${API_BACKEND}/historial/${encodeURIComponent(skey)}`);
      const data = await r.json();
      const path = FileSystem.cacheDirectory + 'facturas_backup.json';
      await FileSystem.writeAsStringAsync(path, JSON.stringify(data, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: 'application/json' });
    } catch { Alert.alert('Error', 'No se pudieron exportar'); }
    setModalExport(false);
  };

  const cerrarSesion = () => {
    Alert.alert('Cerrar sesión', 'Se borrarán los datos locales.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar', style: 'destructive', onPress: async () => {
        await AsyncStorage.multiRemove(['@scanfact_user', '@scanfact_scans', '@scanfact_historial', '@scanfact_plan', '@scanfact_vence']);
        setUser(null); setHistorial([]); setScansUsados(0); setPlanActivo(null); setPaso('registro');
      }},
    ]);
  };

  if (paso === 'cargando') return <View style={s.center}><ActivityIndicator size="large" color="#00BCD4" /></View>;

  if (paso === 'registro') return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingTop: 60 }}>
      <View style={s.logo}><Text style={s.logoText}>SF</Text></View>
      <Text style={s.title}>ScanFact Pro</Text>
      <Text style={s.subtitle}>Registrate para empezar</Text>
      <TextInput style={s.input} value={form.nombre} onChangeText={t => setForm(f => ({ ...f, nombre: t }))} placeholder="Nombre completo" placeholderTextColor="#3a5068" />
      <TextInput style={s.input} value={form.email} onChangeText={t => setForm(f => ({ ...f, email: t }))} placeholder="Email" placeholderTextColor="#3a5068" keyboardType="email-address" autoCapitalize="none" />
      <TextInput style={s.input} value={form.telefono} onChangeText={t => setForm(f => ({ ...f, telefono: t }))} placeholder="WhatsApp / teléfono" placeholderTextColor="#3a5068" keyboardType="phone-pad" />
      <TextInput style={s.input} value={form.negocio} onChangeText={t => setForm(f => ({ ...f, negocio: t }))} placeholder="Nombre de tu negocio" placeholderTextColor="#3a5068" />
      <TouchableOpacity style={s.btn} onPress={registrar}><Text style={s.btnText}>Crear cuenta</Text></TouchableOpacity>
    </ScrollView>
  );

  if (paso === 'planes') return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingTop: 40 }}>
      <Text style={s.title}>Elegí tu plan</Text>
      <Text style={s.subtitle}>Pagás una vez al mes, cancelás cuando quieras</Text>
      {PLANES.map(p => (
        <TouchableOpacity key={p.id} style={s.planCard} onPress={() => seleccionarPlan(p.sku)} disabled={comprando}>
          <Text style={s.planNombre}>{p.nombre}</Text>
          <Text style={s.planPrecio}>{p.precio}</Text>
          <Text style={s.planEscaneos}>{p.escaneos} escaneos / mes</Text>
          <Text style={s.planDetalle}>Cancelación en cualquier momento · Pago por Google Play</Text>
        </TouchableOpacity>
      ))}
      {comprando && <ActivityIndicator size="large" color="#00BCD4" style={{ marginTop: 20 }} />}
      <Text style={s.footer}>Después podés cambiar o cancelar el plan desde Google Play</Text>
    </ScrollView>
  );

  const progreso = planActivo ? ((scansUsados / planActivo.escaneos) * 100).toFixed(0) : 0;

  return (
    <ScrollView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>ScanFact</Text>
        <View style={s.headerRight}>
          {esModoDemo && <Text style={s.badgeDemo}>DEMO</Text>}
          {planActivo && <Text style={s.badge}>{planActivo.nombre}</Text>}
          <TouchableOpacity onPress={() => setModalPlanes(true)}><Text style={s.link}>⚙️</Text></TouchableOpacity>
        </View>
      </View>

      {planActivo && (
        <View style={s.progressCard}>
          <View style={s.progressRow}>
            <Text style={s.progressLabel}>{scansUsados} usados</Text>
            <Text style={s.progressLabel}>{scansRestantes} restantes</Text>
          </View>
          <View style={s.progressBar}><View style={[s.progressFill, { width: `${Math.min(100, progreso)}%` }]} /></View>
          <Text style={s.progressPlan}>{planActivo.nombre} · {planActivo.escaneos} escaneos/mes</Text>
        </View>
      )}

      {!planActivo && (
        <TouchableOpacity style={s.ctaPlan} onPress={() => setModalPlanes(true)}>
          <Text style={s.ctaPlanText}>Elegí un plan de suscripción para empezar a escanear</Text>
        </TouchableOpacity>
      )}

      {!foto ? (
        <View style={s.fotoBox}>
          <Text style={s.fotoIcon}>📸</Text>
          <Text style={s.fotoText}>Foto de la factura</Text>
          <View style={s.fotoBtns}>
            <TouchableOpacity style={s.btnSmall} onPress={tomarFoto}><Text style={s.btnSmallText}>📷 Cámara</Text></TouchableOpacity>
            <TouchableOpacity style={s.btnSmall} onPress={seleccionarFoto}><Text style={s.btnSmallText}>🖼 Galería</Text></TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={s.fotoPreview}>
          <Image source={{ uri: foto.uri }} style={s.previewImg} />
          <TouchableOpacity onPress={() => setFoto(null)}><Text style={s.link}>Cambiar foto</Text></TouchableOpacity>
        </View>
      )}

      {foto && (
        <TouchableOpacity style={[s.btn, (!planActivo || scansRestantes <= 0) && { opacity: 0.5 }]} onPress={procesarFactura} disabled={procesando}>
          {procesando ? <ActivityIndicator color="#0D1B2A" /> : <Text style={s.btnText}>Procesar factura</Text>}
        </TouchableOpacity>
      )}

      {procesando && (
        <View style={s.procesando}><ActivityIndicator size="large" color="#00BCD4" /><Text style={s.procesandoText}>Procesando con IA...</Text></View>
      )}

      {resultado && (
        <View style={s.card}>
          <Text style={s.cardTitle}>{resultado.nombreVendedor || '?'}</Text>
          <Text style={s.cardText}>Factura N°: {resultado.numeroFactura || '?'}</Text>
          <Text style={s.cardText}>Fecha: {resultado.fechaEmision || '?'}</Text>
          <Text style={s.cardTotal}>{Number(resultado.totalGeneral || 0).toLocaleString()} Gs</Text>
          <Text style={s.cardItems}>{resultado.items?.length || 0} artículos</Text>
        </View>
      )}

      <TouchableOpacity style={s.btnOutline} onPress={() => setModalExport(true)}>
        <Text style={s.btnOutlineText}>📥 Exportar facturas (Excel / JSON)</Text>
      </TouchableOpacity>

      {historial.length > 0 && (
        <>
          <Text style={s.sectionTitle}>Últimas escaneadas</Text>
          {historial.map(h => (
            <View key={h.id} style={s.histItem}>
              <View style={{ flex: 1 }}>
                <Text style={s.histVendedor}>{h.vendedor}</Text>
                <Text style={s.histFecha}>{h.fecha} · N° {h.numero}</Text>
              </View>
              <Text style={s.histMonto}>{Number(h.total).toLocaleString()} Gs</Text>
            </View>
          ))}
        </>
      )}

      <TouchableOpacity style={s.btnOutline} onPress={cerrarSesion}>
        <Text style={[s.btnOutlineText, { color: '#FF5252' }]}>Cerrar sesión</Text>
      </TouchableOpacity>

      {/* Modal de planes */}
      <Modal visible={modalPlanes} transparent animationType="slide" onRequestClose={() => setModalPlanes(false)}>
        <View style={s.modalOverlay}>
          <ScrollView style={s.modal}>
            <Text style={s.modalTitle}>Planes de suscripción</Text>
            <Text style={s.modalSub}>Cancelás cuando quieras desde Google Play</Text>

            {planActivo && (
              <View style={s.planActual}>
                <Text style={s.planActualText}>Plan actual: {planActivo.nombre}</Text>
                <Text style={s.planActualScans}>{scansRestantes} escaneos restantes</Text>
              </View>
            )}

            {PLANES.map(p => {
              const activo = planActivo?.id === p.id;
              return (
                <TouchableOpacity key={p.id} style={[s.planCard, activo && s.planCardActivo]} onPress={() => seleccionarPlan(p.sku)} disabled={comprando || activo}>
                  {activo && <Text style={s.planBadge}>ACTUAL</Text>}
                  <Text style={s.planNombre}>{p.nombre}</Text>
                  <Text style={s.planPrecio}>{p.precio}</Text>
                  <Text style={s.planEscaneos}>{p.escaneos} escaneos / mes</Text>
                  {activo ? <Text style={s.planDetalle}>✔ Suscripción activa</Text> : <Text style={s.planDetalle}>Se renueva cada mes automáticamente</Text>}
                </TouchableOpacity>
              );
            })}

              {comprando && <ActivityIndicator size="large" color="#00BCD4" />}
              {esModoDemo && <Text style={s.modalSub}>📱 MODO DEMO — sin Google Play. Los planes se activan localmente para prueba.</Text>}

            <TouchableOpacity style={s.btnOutline} onPress={() => setModalPlanes(false)}>
              <Text style={s.btnOutlineText}>Cerrar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Modal de exportación */}
      <Modal visible={modalExport} transparent animationType="fade" onRequestClose={() => setModalExport(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modal, { maxWidth: 340, alignSelf: 'center' }]}>
            <Text style={s.modalTitle}>Exportar facturas</Text>
            <TouchableOpacity style={s.btn} onPress={exportarExcel}><Text style={s.btnText}>📊 Excel (.csv)</Text></TouchableOpacity>
            <TouchableOpacity style={s.btn} onPress={exportarJSON}><Text style={s.btnText}>📄 JSON</Text></TouchableOpacity>
            <TouchableOpacity style={s.btnOutline} onPress={() => setModalExport(false)}><Text style={s.btnOutlineText}>Cerrar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D1B2A', padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0D1B2A' },
  logo: { width: 60, height: 60, borderRadius: 16, backgroundColor: '#00BCD4', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 12, marginTop: 20 },
  logoText: { fontSize: 28, fontWeight: '900', color: '#0D1B2A' },
  title: { fontSize: 22, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 4 },
  subtitle: { color: '#78909C', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  input: { backgroundColor: '#1B2838', borderRadius: 12, padding: 14, fontSize: 15, color: '#fff', borderWidth: 1, borderColor: '#2A3F4F', marginBottom: 12 },
  btn: { backgroundColor: '#00BCD4', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 10 },
  btnText: { color: '#0D1B2A', fontSize: 16, fontWeight: '700' },
  btnOutline: { borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#2A3F4F' },
  btnOutlineText: { color: '#78909C', fontSize: 14, fontWeight: '600' },
  footer: { color: '#3a5068', fontSize: 11, textAlign: 'center', marginTop: 12 },
  badge: { backgroundColor: 'rgba(0,188,212,.12)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, color: '#00BCD4', fontWeight: '600', fontSize: 11, marginRight: 8 },
  badgeDemo: { backgroundColor: 'rgba(255,87,34,.15)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, color: '#FF8A65', fontWeight: '800', fontSize: 10, marginRight: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40, marginBottom: 16 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  link: { color: '#00BCD4', fontWeight: '600', fontSize: 16 },
  progressCard: { backgroundColor: '#1B2838', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#2A3F4F', marginBottom: 16 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { color: '#78909C', fontSize: 12 },
  progressBar: { height: 6, backgroundColor: '#2A3F4F', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: 6, backgroundColor: '#00BCD4', borderRadius: 3 },
  progressPlan: { color: '#546E7A', fontSize: 11, textAlign: 'center' },
  ctaPlan: { backgroundColor: 'rgba(0,188,212,.1)', borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#00BCD4', borderStyle: 'dashed' },
  ctaPlanText: { color: '#00BCD4', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  fotoBox: { backgroundColor: '#1B2838', borderRadius: 16, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: '#2A3F4F', borderStyle: 'dashed', marginBottom: 16 },
  fotoIcon: { fontSize: 48, marginBottom: 8 },
  fotoText: { color: '#78909C', fontSize: 14, marginBottom: 16 },
  fotoBtns: { flexDirection: 'row', gap: 10 },
  btnSmall: { backgroundColor: '#2A3F4F', borderRadius: 10, padding: 12, paddingHorizontal: 20 },
  btnSmallText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  fotoPreview: { alignItems: 'center', marginBottom: 16 },
  previewImg: { width: '100%', height: 280, borderRadius: 12, marginBottom: 8 },
  procesando: { alignItems: 'center', padding: 24 },
  procesandoText: { color: '#78909C', marginTop: 8, fontSize: 14 },
  card: { backgroundColor: '#1B2838', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#2A3F4F', marginBottom: 16 },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#00BCD4', marginBottom: 8 },
  cardText: { color: '#B0BEC5', fontSize: 14, marginBottom: 4 },
  cardTotal: { fontSize: 24, fontWeight: '800', color: '#4DD0E1', marginTop: 8 },
  cardItems: { color: '#546E7A', fontSize: 12, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 12, marginTop: 8 },
  histItem: { backgroundColor: '#1B2838', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#2A3F4F', flexDirection: 'row', alignItems: 'center' },
  histVendedor: { color: '#00BCD4', fontWeight: '600', fontSize: 14 },
  histMonto: { color: '#4DD0E1', fontWeight: '700', fontSize: 16 },
  histFecha: { color: '#546E7A', fontSize: 12, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.7)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#1B2838', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '80%' },
  modalTitle: { color: '#00BCD4', fontSize: 20, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  modalSub: { color: '#546E7A', fontSize: 12, textAlign: 'center', marginBottom: 16 },
  planActual: { backgroundColor: 'rgba(0,188,212,.08)', borderRadius: 10, padding: 12, marginBottom: 12, alignItems: 'center' },
  planActualText: { color: '#00BCD4', fontWeight: '600', fontSize: 14 },
  planActualScans: { color: '#78909C', fontSize: 12, marginTop: 2 },
  planCard: { backgroundColor: '#0D1B2A', borderRadius: 14, padding: 18, marginBottom: 10, borderWidth: 1, borderColor: '#2A3F4F' },
  planCardActivo: { borderColor: '#00BCD4', borderWidth: 2 },
  planBadge: { position: 'absolute', top: 10, right: 14, backgroundColor: '#00BCD4', color: '#0D1B2A', fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  planNombre: { color: '#fff', fontSize: 18, fontWeight: '700' },
  planPrecio: { color: '#00BCD4', fontSize: 24, fontWeight: '800', marginTop: 4 },
  planEscaneos: { color: '#B0BEC5', fontSize: 14, marginTop: 2 },
  planDetalle: { color: '#546E7A', fontSize: 11, marginTop: 6 },
});
