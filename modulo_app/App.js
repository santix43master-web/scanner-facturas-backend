import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, Alert,
  ScrollView, TextInput, Modal, Animated, AppState, StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme } from './utils/ThemeContext';
import { cargarSucursal, borrarSucursal, cargarHistorial, guardarEnHistorial, eliminarDelHistorial, esPasswordValida, obtenerFacturaCompleta } from './utils/storage';
import { obtenerHistorial } from './utils/api';
import LoginScreen from './screens/LoginScreen';
import EscanearScreen from './screens/EscanearScreen';
import PreciosScreen from './screens/PreciosScreen';
import DrawerMenu from './components/DrawerMenu';

function AppContent() {
  const { theme, isDark, toggleTheme } = useTheme();
  const [sucursalActual, setSucursalActual] = useState(null);
  const [mostrarLogin, setMostrarLogin] = useState(true);
  const [tabActivo, setTabActivo] = useState('escanear');
  const [historial, setHistorial] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [modalPassword, setModalPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordTarget, setPasswordTarget] = useState(null);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const urlServidor = "https://scanner-facturas-backend.onrender.com";

  useEffect(() => {
    (async () => {
      const sucursalGuardada = await cargarSucursal();
      if (sucursalGuardada) {
        setSucursalActual(sucursalGuardada);
        setMostrarLogin(false);
      }
      const h = await cargarHistorial();
      setHistorial(h);
      if (sucursalGuardada) sincronizarHistorial(sucursalGuardada);
    })();
  }, []);

  useEffect(() => {
    if (!mostrarLogin) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    }
  }, [mostrarLogin]);

  useEffect(() => {
    if (!sucursalActual) return;
    const intervalo = setInterval(() => sincronizarHistorial(), 30000);
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active' && sucursalActual) sincronizarHistorial();
    });
    return () => { clearInterval(intervalo); sub.remove(); };
  }, [sucursalActual]);

  const sincronizarHistorial = async (sucursalOverride) => {
    const sucursal = sucursalOverride || sucursalActual;
    try {
      const json = await obtenerHistorial(sucursal, urlServidor);
      if (json.facturas && json.facturas.length > 0) {
        const localStr = await AsyncStorage.getItem('@facturas_r21');
        const local = localStr ? JSON.parse(localStr) : [];
        const idsRemotos = new Set(json.facturas.map(f => f.id));
        const sinDuplicar = local.filter(f => !idsRemotos.has(f.id));
        const todos = [...json.facturas.map(f => ({
          id: f.id, fechaEscaneo: f.fecha || '?', sucursal: sucursalActual,
          empresa: f.vendedor, rucVendedor: '', rucComprador: '', numero: f.numero, monto: f.total || 0,
        })), ...sinDuplicar];
        setHistorial(todos);
        await AsyncStorage.setItem('@facturas_r21', JSON.stringify(todos));
      }
    } catch {}
  };

  const handleLogin = (sucursal) => {
    setSucursalActual(sucursal);
    setMostrarLogin(false);
    sincronizarHistorial(sucursal);
  };

  const handleFacturaProcesada = async (nuevaFactura) => {
    const nuevoHistorial = await guardarEnHistorial(historial, nuevaFactura, sucursalActual);
    setHistorial(nuevoHistorial);
  };

  const cambiarSucursal = () => {
    Alert.alert("Cambiar Sucursal", "Se cerrará la sesión actual", [
      { text: "Cancelar", style: "cancel" },
      { text: "Confirmar", style: "destructive", onPress: async () => {
        await borrarSucursal();
        setSucursalActual(null);
        setMostrarLogin(true);
        setMenuAbierto(false);
      }},
    ]);
  };

  const confirmarBorrado = async () => {
    if (!esPasswordValida(passwordInput)) {
      Alert.alert("Error", "Contraseña incorrecta");
      setPasswordInput('');
      return;
    }
    if (passwordTarget === 'all') {
      await AsyncStorage.removeItem('@facturas_r21');
      await AsyncStorage.removeItem('@facturas_r21_full');
      setHistorial([]);
      Alert.alert("Listo", "Historial borrado correctamente");
    } else if (passwordTarget) {
      const nuevo = await eliminarDelHistorial(passwordTarget);
      setHistorial(nuevo);
    }
    setModalPassword(false);
    setPasswordInput('');
    setPasswordTarget(null);
  };

  const solicitarPassword = (target) => {
    setPasswordTarget(target);
    setPasswordInput('');
    setModalPassword(true);
  };

  const historialFiltrado = historial.filter(item =>
    item.sucursal === sucursalActual &&
    (item.empresa?.toLowerCase().includes(busqueda.toLowerCase()) ||
     item.numero?.toLowerCase().includes(busqueda.toLowerCase()))
  );

  const calcularTotalGastos = () =>
    historial.filter(i => i.sucursal === sucursalActual)
      .reduce((ac, i) => ac + Number(i.monto || 0), 0);

  if (mostrarLogin) return <LoginScreen onLogin={handleLogin} />;

  return (
    <View style={[styles.main, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.headerBg} />
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
          <TouchableOpacity style={styles.hamburger} onPress={() => setMenuAbierto(true)}>
            <View style={[styles.hamLine, { backgroundColor: theme.primary }]} />
            <View style={[styles.hamLine, { backgroundColor: theme.primary }]} />
            <View style={[styles.hamLine, { backgroundColor: theme.primary }]} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.primary }]}>R21</Text>
          <View style={[styles.badge, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
            <Text style={[styles.badgeText, { color: theme.primary }]}>{sucursalActual}</Text>
          </View>
        </View>

        <View style={[styles.tabBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.tab, tabActivo === 'escanear' && { backgroundColor: theme.tabActiveBg }]}
            onPress={() => setTabActivo('escanear')}
          >
            <Text style={[styles.tabIcon, { color: tabActivo === 'escanear' ? theme.tabActiveText : theme.tabInactive }]}>📄</Text>
            <Text style={[styles.tabLabel, { color: tabActivo === 'escanear' ? theme.tabActiveText : theme.tabInactive }]}>Escanear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tabActivo === 'precios' && { backgroundColor: theme.tabActiveBg }]}
            onPress={() => setTabActivo('precios')}
          >
            <Text style={[styles.tabIcon, { color: tabActivo === 'precios' ? theme.tabActiveText : theme.tabInactive }]}>📊</Text>
            <Text style={[styles.tabLabel, { color: tabActivo === 'precios' ? theme.tabActiveText : theme.tabInactive }]}>Precios</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {tabActivo === 'escanear' && (
            <EscanearScreen sucursalActual={sucursalActual} urlServidor={urlServidor} onFacturaProcesada={handleFacturaProcesada} />
          )}
          {tabActivo === 'precios' && (
            <PreciosScreen urlServidor={urlServidor} />
          )}
        </ScrollView>
      </Animated.View>

      <Modal visible={modalPassword} transparent animationType="fade" onRequestClose={() => { setModalPassword(false); setPasswordTarget(null); setPasswordInput(''); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {passwordTarget === 'all' ? 'Borrar historial completo' : 'Eliminar factura'}
            </Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              placeholder="Contraseña"
              placeholderTextColor={theme.textMuted}
              value={passwordInput}
              onChangeText={setPasswordInput}
              secureTextEntry
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.surfaceLight }]} onPress={() => { setModalPassword(false); setPasswordTarget(null); setPasswordInput(''); }}>
                <Text style={[styles.modalBtnText, { color: theme.textSecondary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.danger }]} onPress={confirmarBorrado}>
                <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <DrawerMenu
        visible={menuAbierto}
        onClose={() => setMenuAbierto(false)}
        sucursalActual={sucursalActual}
        calculoTotal={calcularTotalGastos()}
        historialFiltrado={historialFiltrado}
        busqueda={busqueda}
        onChangeBusqueda={setBusqueda}
        onBorrarHistorial={() => solicitarPassword('all')}
        onEliminarFactura={(id) => solicitarPassword(id)}
        onCambiarSucursal={cambiarSucursal}
        onSincronizar={() => sincronizarHistorial()}
        onThemeToggle={toggleTheme}
        onExpandirFactura={async (item) => {
          const completa = await obtenerFacturaCompleta(item.id);
          if (completa) {
            setHistorial(prev => prev.map(h => h.id === item.id ? { ...h, detalles: completa } : h));
          }
        }}
      />
    </View>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  main: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 52, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1,
  },
  hamburger: { width: 30, height: 22, justifyContent: 'space-between', paddingVertical: 2 },
  hamLine: { height: 3, borderRadius: 2 },
  headerTitle: { fontSize: 26, fontWeight: '800', letterSpacing: 6 },
  badge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  tabBar: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 12, marginBottom: 8,
    borderRadius: 14, padding: 4, borderWidth: 1, elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8,
  },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, gap: 6 },
  tabIcon: { fontSize: 16 },
  tabLabel: { fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  scrollContent: { padding: 16, alignItems: 'center', paddingBottom: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  modalCard: { width: '100%', borderRadius: 20, padding: 28, borderWidth: 1, elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 24 },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 24, textAlign: 'center' },
  modalInput: { borderWidth: 1, borderRadius: 14, padding: 16, fontSize: 16, marginBottom: 24 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  modalBtnText: { fontSize: 16, fontWeight: '700' },
});
