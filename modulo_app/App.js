import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, Alert,
  ScrollView, TextInput, Modal, Animated, AppState,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { cargarSucursal, borrarSucursal, cargarHistorial as cargarHistorialStorage, borrarHistorialStorage } from './utils/storage';
import { obtenerHistorial } from './utils/api';
import LoginScreen from './screens/LoginScreen';
import EscanearScreen from './screens/EscanearScreen';
import PreciosScreen from './screens/PreciosScreen';
import DrawerMenu from './components/DrawerMenu';

export default function App() {
  const [sucursalActual, setSucursalActual] = useState(null);
  const [mostrarLogin, setMostrarLogin] = useState(true);
  const [tabActivo, setTabActivo] = useState('escanear');
  const [historial, setHistorial] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [modalPassword, setModalPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const urlServidor = "https://scanner-facturas-backend.onrender.com";

  useEffect(() => {
    (async () => {
      const sucursalGuardada = await cargarSucursal();
      if (sucursalGuardada) {
        setSucursalActual(sucursalGuardada);
        setMostrarLogin(false);
      }
      const h = await cargarHistorialStorage();
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
    const datosOptimizados = {
      id: Date.now().toString(),
      fechaEscaneo: new Date().toLocaleDateString('es-PY'),
      sucursal: sucursalActual,
      empresa: nuevaFactura.nombreVendedor || 'Comercio Desconocido',
      rucVendedor: nuevaFactura.rucVendedor || 'Sin RUC',
      rucComprador: nuevaFactura.rucComprador || 'Sin RUC Comprador',
      numero: nuevaFactura.numeroFactura || 'Sin N°',
      monto: nuevaFactura.totalGeneral || 0,
    };
    const nuevoHistorial = [datosOptimizados, ...historial];
    setHistorial(nuevoHistorial);
    await AsyncStorage.setItem('@facturas_r21', JSON.stringify(nuevoHistorial));
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
    if (passwordInput === "r21scann_2026") {
      await borrarHistorialStorage();
      setHistorial([]);
      setModalPassword(false);
      setPasswordInput('');
      Alert.alert("Listo", "Historial borrado correctamente");
    } else {
      Alert.alert("Error", "Contraseña incorrecta");
      setPasswordInput('');
    }
  };

  const historialFiltrado = historial.filter(item =>
    item.sucursal === sucursalActual &&
    (item.empresa?.toLowerCase().includes(busqueda.toLowerCase()) ||
     item.numero?.toLowerCase().includes(busqueda.toLowerCase()))
  );

  const calcularTotalGastos = () =>
    historial.filter(i => i.sucursal === sucursalActual)
      .reduce((ac, i) => ac + Number(i.monto || 0), 0);

  return (
    <View style={styles.mainWrapper}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.btnMenuHamburguesa} onPress={() => setMenuAbierto(true)}>
            <View style={styles.lineaHamburguesa} />
            <View style={styles.lineaHamburguesa} />
            <View style={styles.lineaHamburguesa} />
          </TouchableOpacity>
          <Text style={styles.header}>Scanner R21</Text>
          <View style={styles.badgeSucursal}>
            <Text style={styles.badgeSucursalText}>{sucursalActual}</Text>
          </View>
        </View>

        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, tabActivo === 'escanear' && styles.tabItemActivo]}
            onPress={() => setTabActivo('escanear')}
            activeOpacity={0.85}
          >
            <Text style={styles.tabIcono}>📄</Text>
            <Text style={[styles.tabText, tabActivo === 'escanear' && styles.tabTextActivo]}>Escanear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, tabActivo === 'precios' && styles.tabItemActivo]}
            onPress={() => setTabActivo('precios')}
            activeOpacity={0.85}
          >
            <Text style={styles.tabIcono}>📊</Text>
            <Text style={[styles.tabText, tabActivo === 'precios' && styles.tabTextActivo]}>Precios</Text>
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
        onRequestClose={() => { setModalPassword(false); setPasswordInput(''); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitulo}>Borrar Historial</Text>
            <Text style={styles.modalSubtitulo}>Esta accion es irreversible</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Contrasena"
              placeholderTextColor="#90A4AE"
              value={passwordInput}
              onChangeText={setPasswordInput}
              secureTextEntry={true}
              autoFocus={true}
            />
            <View style={styles.modalBotones}>
              <TouchableOpacity style={styles.btnModalCancelar} onPress={() => { setModalPassword(false); setPasswordInput(''); }}>
                <Text style={styles.btnModalTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnModalConfirmar} onPress={confirmarBorrado}>
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
        onBorrarHistorial={() => setModalPassword(true)}
        onCambiarSucursal={cambiarSucursal}
        onSincronizar={() => { sincronizarHistorial(); Alert.alert("Sincronizado", "Historial actualizado desde el servidor"); }}
      />
      </Animated.View>
    </View>
  );
}
const styles = StyleSheet.create({
  mainWrapper: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 20, alignItems: 'center', minHeight: '100%' },

  topBar: {
    flexDirection: 'row', width: '100%', alignItems: 'center',
    justifyContent: 'space-between', marginTop: 50, marginBottom: 10,
  },
  header: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF', letterSpacing: 2 },
  badgeSucursal: {
    backgroundColor: '#00BCD4', paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, elevation: 4, shadowColor: '#00BCD4',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6,
  },
  badgeSucursalText: { color: '#0D1B2A', fontSize: 12, fontWeight: 'bold' },
  btnMenuHamburguesa: { width: 32, height: 24, justifyContent: 'space-between', padding: 2 },
  lineaHamburguesa: { width: 28, height: 3, backgroundColor: '#00BCD4', borderRadius: 2 },

  tabBar: {
    flexDirection: 'row', width: '100%', backgroundColor: '#1B2838',
    borderRadius: 16, padding: 4, marginBottom: 10, borderWidth: 1, borderColor: '#2A3F4F',
  },
  tabItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, gap: 6,
  },
  tabItemActivo: {
    backgroundColor: '#00BCD4', elevation: 4, shadowColor: '#00BCD4',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6,
  },
  tabIcono: { fontSize: 16 },
  tabText: { color: '#78909C', fontWeight: 'bold', fontSize: 14, letterSpacing: 1 },
  tabTextActivo: { color: '#0D1B2A' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { backgroundColor: '#1B2838', borderRadius: 20, padding: 25, width: '85%', borderWidth: 1, borderColor: '#2A3F4F' },
  modalTitulo: { fontSize: 20, fontWeight: 'bold', color: '#EF5350', textAlign: 'center', marginBottom: 8 },
  modalSubtitulo: { fontSize: 14, color: '#78909C', textAlign: 'center', marginBottom: 20 },
  modalInput: { borderWidth: 1, borderColor: '#2A3F4F', borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 20, backgroundColor: '#0D1B2A', color: '#FFFFFF' },
  modalBotones: { flexDirection: 'row', gap: 12 },
  btnModalCancelar: { flex: 1, backgroundColor: '#37474F', padding: 14, borderRadius: 12, alignItems: 'center' },
  btnModalConfirmar: { flex: 1, backgroundColor: '#EF5350', padding: 14, borderRadius: 12, alignItems: 'center' },
  btnModalTexto: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  btnModalTextoConfirmar: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
});
