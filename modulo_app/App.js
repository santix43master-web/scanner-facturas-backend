import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, Alert,
  ScrollView, TextInput, Modal, Animated, AppState,
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
  const { theme, toggleTheme } = useTheme();
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
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
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
    Alert.alert("Cambiar Sucursal", "Se cerrara la sesion actual", [
      { text: "Cancelar", style: "cancel" },
      { text: "Confirmar", onPress: async () => {
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
    <View style={[styles.mainWrapper, { backgroundColor: theme.background }]}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.btnMenuHamburguesa} onPress={() => setMenuAbierto(true)}>
            <View style={[styles.lineaHamburguesa, { backgroundColor: theme.text }]} />
            <View style={[styles.lineaHamburguesa, { backgroundColor: theme.text }]} />
            <View style={[styles.lineaHamburguesa, { backgroundColor: theme.text }]} />
          </TouchableOpacity>
          <Text style={[styles.header, { color: theme.text }]}>R21</Text>
          <View style={[styles.badgeSucursal, { borderColor: theme.textSecondary }]}>
            <Text style={[styles.badgeSucursalText, { color: theme.textSecondary }]}>{sucursalActual}</Text>
          </View>
        </View>

        <View style={[styles.tabBar, { borderColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.tabItem, tabActivo === 'escanear' && styles.tabItemActive, tabActivo === 'escanear' && { borderBottomColor: theme.primary }]}
            onPress={() => setTabActivo('escanear')}
          >
            <Text style={[styles.tabText, { color: tabActivo === 'escanear' ? theme.primary : theme.textMuted }]}>Escanear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, tabActivo === 'precios' && styles.tabItemActive, tabActivo === 'precios' && { borderBottomColor: theme.primary }]}
            onPress={() => setTabActivo('precios')}
          >
            <Text style={[styles.tabText, { color: tabActivo === 'precios' ? theme.primary : theme.textMuted }]}>Precios</Text>
          </TouchableOpacity>
        </View>

        {tabActivo === 'escanear' && (
          <EscanearScreen sucursalActual={sucursalActual} urlServidor={urlServidor} onFacturaProcesada={handleFacturaProcesada} />
        )}

        {tabActivo === 'precios' && (
          <PreciosScreen urlServidor={urlServidor} />
        )}
      </ScrollView>

      <Modal visible={modalPassword} transparent animationType="fade" onRequestClose={() => { setModalPassword(false); setPasswordTarget(null); setPasswordInput(''); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitulo, { color: theme.text }]}>
              {passwordTarget === 'all' ? 'Borrar historial' : 'Eliminar factura'}
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
            <View style={styles.modalBotones}>
              <TouchableOpacity style={styles.btnModalCancelar} onPress={() => { setModalPassword(false); setPasswordTarget(null); setPasswordInput(''); }}>
                <Text style={[styles.btnModalTexto, { color: theme.textSecondary }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmarBorrado}>
                <Text style={[styles.btnModalTexto, { color: theme.danger }]}>Confirmar</Text>
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
        onSincronizar={() => { sincronizarHistorial(); }}
        onThemeToggle={toggleTheme}
        onExpandirFactura={async (item) => {
          const completa = await obtenerFacturaCompleta(item.id);
          if (completa) {
            setHistorial(prev => prev.map(h => h.id === item.id ? { ...h, detalles: completa } : h));
          }
        }}
      />
      </Animated.View>
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
  mainWrapper: { flex: 1 },
  container: { padding: 16, alignItems: 'center' },
  topBar: { flexDirection: 'row', width: '100%', alignItems: 'center', justifyContent: 'space-between', marginTop: 56, marginBottom: 24 },
  header: { fontSize: 24, fontWeight: '600', letterSpacing: 4 },
  badgeSucursal: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderRadius: 4 },
  badgeSucursalText: { fontSize: 12, fontWeight: '500' },
  btnMenuHamburguesa: { width: 28, height: 20, justifyContent: 'space-between' },
  lineaHamburguesa: { height: 2, borderRadius: 1 },
  tabBar: { flexDirection: 'row', width: '100%', borderBottomWidth: 1, borderBottomColor: 'transparent', marginBottom: 24 },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemActive: {},
  tabText: { fontSize: 14, fontWeight: '500', letterSpacing: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { padding: 24, width: '80%' },
  modalTitulo: { fontSize: 18, fontWeight: '600', marginBottom: 20, textAlign: 'center' },
  modalInput: { borderWidth: 1, padding: 12, fontSize: 15, marginBottom: 20 },
  modalBotones: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20 },
  btnModalTexto: { fontSize: 15, fontWeight: '500' },
});
