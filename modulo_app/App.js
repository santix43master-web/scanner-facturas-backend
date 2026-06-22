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
      Alert.alert("Listo", "Historial borrado correctamente");
    } else if (passwordTarget) {
      const nuevo = await eliminarDelHistorial(passwordTarget);
      setHistorial(nuevo);
      Alert.alert("Listo", "Factura eliminada del historial");
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
      <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.btnMenuHamburguesa} onPress={() => setMenuAbierto(true)}>
            <View style={[styles.lineaHamburguesa, { backgroundColor: theme.primary }]} />
            <View style={[styles.lineaHamburguesa, { backgroundColor: theme.primary }]} />
            <View style={[styles.lineaHamburguesa, { backgroundColor: theme.primary }]} />
          </TouchableOpacity>
          <Text style={[styles.header, { color: theme.text }]}>Scanner R21</Text>
          <View style={[styles.badgeSucursal, { backgroundColor: theme.primary }]}>
            <Text style={[styles.badgeSucursalText, { color: theme.badgeText }]}>{sucursalActual}</Text>
          </View>
        </View>

        <View style={[styles.tabBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <TouchableOpacity
            style={[styles.tabItem, tabActivo === 'escanear' && { backgroundColor: theme.tabActiveBg }]}
            onPress={() => setTabActivo('escanear')}
            activeOpacity={0.85}
          >
            <Text style={styles.tabIcono}>📄</Text>
            <Text style={[styles.tabText, { color: tabActivo === 'escanear' ? theme.tabActiveText : theme.tabInactive }]}>Escanear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, tabActivo === 'precios' && { backgroundColor: theme.tabActiveBg }]}
            onPress={() => setTabActivo('precios')}
            activeOpacity={0.85}
          >
            <Text style={styles.tabIcono}>📊</Text>
            <Text style={[styles.tabText, { color: tabActivo === 'precios' ? theme.tabActiveText : theme.tabInactive }]}>Precios</Text>
          </TouchableOpacity>
        </View>

        {tabActivo === 'escanear' && (
          <EscanearScreen sucursalActual={sucursalActual} urlServidor={urlServidor} onFacturaProcesada={handleFacturaProcesada} />
        )}

        {tabActivo === 'precios' && (
          <PreciosScreen urlServidor={urlServidor} />
        )}
      </ScrollView>

      <Modal
        visible={modalPassword}
        transparent={true}
        animationType="fade"
        onRequestClose={() => { setModalPassword(false); setPasswordTarget(null); setPasswordInput(''); }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.modalTitulo, { color: theme.danger }]}>
              {passwordTarget === 'all' ? 'Borrar Todo el Historial' : 'Eliminar Factura'}
            </Text>
            <Text style={[styles.modalSubtitulo, { color: theme.textSecondary }]}>Ingresá la contraseña para confirmar</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
              placeholder="Contrasena"
              placeholderTextColor={theme.textMuted}
              value={passwordInput}
              onChangeText={setPasswordInput}
              secureTextEntry={true}
              autoFocus={true}
            />
            <View style={styles.modalBotones}>
              <TouchableOpacity style={[styles.btnModalCancelar, { backgroundColor: theme.cardTag }]} onPress={() => { setModalPassword(false); setPasswordTarget(null); setPasswordInput(''); }}>
                <Text style={styles.btnModalTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnModalConfirmar, { backgroundColor: theme.danger }]} onPress={confirmarBorrado}>
                <Text style={styles.btnModalTextoConfirmar}>Confirmar</Text>
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
        onSincronizar={() => { sincronizarHistorial(); Alert.alert("Sincronizado", "Historial actualizado desde el servidor"); }}
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
  container: { padding: 20, alignItems: 'center', minHeight: '100%' },
  topBar: { flexDirection: 'row', width: '100%', alignItems: 'center', justifyContent: 'space-between', marginTop: 50, marginBottom: 10 },
  header: { fontSize: 20, fontWeight: 'bold', letterSpacing: 2 },
  badgeSucursal: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, elevation: 4, shadowColor: '#00BCD4', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6 },
  badgeSucursalText: { fontSize: 12, fontWeight: 'bold' },
  btnMenuHamburguesa: { width: 32, height: 24, justifyContent: 'space-between', padding: 2 },
  lineaHamburguesa: { width: 28, height: 3, borderRadius: 2 },
  tabBar: { flexDirection: 'row', width: '100%', borderRadius: 16, padding: 4, marginBottom: 10, borderWidth: 1 },
  tabItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, gap: 6 },
  tabIcono: { fontSize: 16 },
  tabText: { fontWeight: 'bold', fontSize: 14, letterSpacing: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { borderRadius: 20, padding: 25, width: '85%', borderWidth: 1 },
  modalTitulo: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  modalSubtitulo: { fontSize: 14, textAlign: 'center', marginBottom: 20 },
  modalInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 20 },
  modalBotones: { flexDirection: 'row', gap: 12 },
  btnModalCancelar: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  btnModalConfirmar: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  btnModalTexto: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  btnModalTextoConfirmar: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
});
