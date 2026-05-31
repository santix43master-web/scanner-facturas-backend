import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  Image, 
  ActivityIndicator, 
  Alert, 
  ScrollView, 
  TextInput, 
  Dimensions,
  Modal,
  Platform
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

const { width: SCREEN_WIDTH } = Dimensions.get('window'); 

export default function App() {
  const [sucursalActual, setSucursalActual] = useState(null);
  const [mostrarLogin, setMostrarLogin] = useState(true);
  const [inputSucursal, setInputSucursal] = useState('');

  const [foto, setFoto] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [datosFactura, setDatosFactura] = useState(null);
  const [historial, setHistorial] = useState([]); 
  
  const [urlServidor, setUrlServidor] = useState("https://scanner-facturas-backend.onrender.com");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const [modalPassword, setModalPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  useEffect(() => {
    (async () => {
      const sucursalGuardada = await AsyncStorage.getItem('@sucursal_actual');
      if (sucursalGuardada) {
        setSucursalActual(sucursalGuardada);
        setMostrarLogin(false);
      }
      await ImagePicker.requestMediaLibraryPermissionsAsync();
      await ImagePicker.requestCameraPermissionsAsync();
      cargarHistorial();
    })();
  }, []);

  const loginSucursal = async () => {
    const sucursal = inputSucursal.trim();
    const permitidas = ["Minimarket LF", "Local 1"];
    
    if (permitidas.includes(sucursal)) {
      setSucursalActual(sucursal);
      await AsyncStorage.setItem('@sucursal_actual', sucursal);
      setMostrarLogin(false);
      setInputSucursal('');
    } else {
      Alert.alert("❌ Error", "Sucursal no reconocida");
    }
  };

  const cargarHistorial = async () => {
    try {
      const datosGuardados = await AsyncStorage.getItem('@facturas_r21');
      if (datosGuardados !== null) {
        setHistorial(JSON.parse(datosGuardados));
      }
    } catch (error) {
      console.error("Error al cargar historial", error);
      Alert.alert("Error", "No se pudo cargar el historial");
    }
  };

  const guardarEnHistorial = async (nuevaFactura) => {
    try {
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
    } catch (error) {
      console.error("Error al guardar:", error);
      Alert.alert("Error", "No se pudo guardar en el historial");
    }
  };

  const borrarHistorialConPass = () => {
    setModalPassword(true);
  };

  const confirmarBorrado = async () => {
    if (passwordInput === "r21scann_2026") {
      try {
        await AsyncStorage.removeItem('@facturas_r21');
        setHistorial([]);
        setModalPassword(false);
        setPasswordInput('');
        Alert.alert("✅ Éxito", "Historial borrado correctamente");
      } catch (error) {
        Alert.alert("Error", "No se pudo borrar el historial");
      }
    } else {
      Alert.alert("❌ Error", "Contraseña incorrecta");
      setPasswordInput('');
    }
  };

  // ==================== 🔥 GENERAR PDF ====================
  const generarPDF = async () => {
  if (!datosFactura) {
    Alert.alert("Aviso", "Primero procesa una factura");
    return;
  }

  try {
    setCargando(true);

    // Generar filas de la tabla de artículos
    let filasItems = '';
    if (datosFactura.items && datosFactura.items.length > 0) {
      filasItems = datosFactura.items.map((item, index) => `
        <tr style="border-bottom: 1px solid #e0e0e0;">
          <td style="padding: 12px 8px; text-align: center; font-size: 13px;">${index + 1}</td>
          <td style="padding: 12px 8px; font-size: 13px;">${item.descripcion || 'Sin descripción'}</td>
          <td style="padding: 12px 8px; text-align: center; font-size: 13px;">${item.codigo || '-'}</td>
          <td style="padding: 12px 8px; text-align: center; font-size: 13px;">${item.codigo_barras || '-'}</td>
          <td style="padding: 12px 8px; text-align: center; font-size: 13px;">${item.cantidad || 1}</td>
          <td style="padding: 12px 8px; text-align: right; font-size: 13px;">${Number(item.precio_unitario || 0).toLocaleString('es-PY')}</td>
          <td style="padding: 12px 8px; text-align: right; font-weight: bold; font-size: 13px; color: #00838F;">${Number(item.subtotal || 0).toLocaleString('es-PY')}</td>
        </tr>
      `).join('');
    } else {
      filasItems = `
        <tr>
          <td colspan="7" style="padding: 20px; text-align: center; color: #9E9E9E; font-style: italic;">
            No se detectaron artículos en la factura
          </td>
        </tr>
      `;
    }

    // HTML del PDF (mantén tu HTML original aquí)
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 30px; background: #ffffff; color: #333; }
          .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #00BCD4; }
          .header h1 { color: #006064; font-size: 28px; margin-bottom: 8px; }
          .header p { color: #00838F; font-size: 16px; font-weight: 500; }
          .info-section { background: #E0F7FA; padding: 20px; border-radius: 10px; margin-bottom: 25px; border-left: 5px solid #00BCD4; }
          .info-section h2 { color: #006064; font-size: 18px; margin-bottom: 15px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
          .info-item { background: white; padding: 10px 15px; border-radius: 6px; font-size: 14px; }
          .info-item strong { color: #00838F; display: block; margin-bottom: 4px; font-size: 12px; }
          .info-item span { color: #424242; font-size: 14px; }
          .table-section { margin-top: 25px; }
          .table-section h2 { color: #006064; font-size: 18px; margin-bottom: 15px; }
          table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
          thead { background: linear-gradient(135deg, #00838F 0%, #00BCD4 100%); color: white; }
          thead th { padding: 14px 8px; text-align: left; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
          tbody tr:nth-child(even) { background-color: #F5F5F5; }
          tbody tr:hover { background-color: #E0F7FA; }
          .total-section { margin-top: 25px; text-align: right; padding: 20px; background: linear-gradient(135deg, #00838F 0%, #00BCD4 100%); border-radius: 10px; color: white; }
          .total-section h3 { font-size: 16px; margin-bottom: 8px; font-weight: 500; }
          .total-section .amount { font-size: 32px; font-weight: bold; }
          .footer { margin-top: 40px; text-align: center; padding-top: 20px; border-top: 2px solid #E0E0E0; color: #757575; font-size: 12px; }
          .footer p { margin: 5px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📄 FACTURA DIGITALIZADA</h1>
          <p>Scanner R21 - Sistema de Gestión</p>
        </div>

        <div class="info-section">
          <h2>🏢 INFORMACIÓN GENERAL</h2>
          <div class="info-grid">
            <div class="info-item"><strong>🏪 SUCURSAL</strong><span>${sucursalActual}</span></div>
            <div class="info-item"><strong>📅 FECHA DE ESCANEO</strong><span>${new Date().toLocaleDateString('es-PY', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
            <div class="info-item"><strong>🏢 VENDEDOR</strong><span>${datosFactura.nombreVendedor || 'No detectado'}</span></div>
            <div class="info-item"><strong>🆔 RUC VENDEDOR</strong><span>${datosFactura.rucVendedor || 'No detectado'}</span></div>
            <div class="info-item"><strong>👤 RUC COMPRADOR</strong><span>${datosFactura.rucComprador || 'No detectado'}</span></div>
            <div class="info-item"><strong>📄 N° FACTURA</strong><span>${datosFactura.numeroFactura || 'No detectado'}</span></div>
            <div class="info-item"><strong>🔢 TIMBRADO</strong><span>${datosFactura.timbrado || 'No detectado'}</span></div>
            <div class="info-item"><strong>📆 FECHA EMISIÓN</strong><span>${datosFactura.fechaEmision || 'No detectado'}</span></div>
          </div>
        </div>

        <div class="table-section">
          <h2>📦 DETALLE DE ARTÍCULOS</h2>
          <table>
            <thead>
              <tr>
                <th style="text-align: center;">#</th>
                <th>DESCRIPCIÓN</th>
                <th style="text-align: center;">CÓDIGO</th>
                <th style="text-align: center;">COD. BARRAS</th>
                <th style="text-align: center;">CANT.</th>
                <th style="text-align: right;">PRECIO UNIT.</th>
                <th style="text-align: right;">SUBTOTAL</th>
              </tr>
            </thead>
            <tbody>${filasItems}</tbody>
          </table>
        </div>

        <div class="total-section">
          <h3>💰 TOTAL GENERAL</h3>
          <div class="amount">₲ ${Number(datosFactura.totalGeneral || 0).toLocaleString('es-PY')}</div>
        </div>

        <div class="footer">
          <p><strong>Scanner R21</strong> - Sistema de Digitalización de Facturas</p>
          <p>Documento generado el ${new Date().toLocaleString('es-PY')}</p>
          <p>© ${new Date().getFullYear()} - Todos los derechos reservados</p>
        </div>
      </body>
      </html>
    `;

    // ✅ GENERAR PDF (sin mover archivo, compartir directamente)
    const { uri } = await Print.printToFileAsync({ 
      html: htmlContent,
      base64: false
    });

    console.log('PDF generado en:', uri);

    // ✅ COMPARTIR DIRECTAMENTE (sin necesidad de mover)
    const isAvailable = await Sharing.isAvailableAsync();
    
    if (isAvailable) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: '📄 Compartir Factura PDF',
        UTI: 'com.adobe.pdf'
      });
      Alert.alert("✅ Éxito", "PDF generado correctamente");
    } else {
      Alert.alert(
        "✅ PDF Creado",
        `El archivo se guardó correctamente y está listo para compartir.`,
        [{ text: "OK" }]
      );
    }

  } catch (error) {
    console.error("Error al generar PDF:", error);
    Alert.alert(
      "❌ Error al generar PDF",
      `Detalles: ${error.message}\n\nIntenta nuevamente o contacta soporte.`
    );
  } finally {
    setCargando(false);
  }
};

  const procesarIA = async () => {
    if (!foto) {
      Alert.alert("Error", "No hay foto para procesar");
      return;
    }

    setCargando(true);
    setDatosFactura(null);

    try {
      const formData = new FormData();
      formData.append('factura', { 
        uri: foto, 
        name: 'factura.jpg', 
        type: 'image/jpeg' 
      });

      const res = await fetch(`${urlServidor}/procesar`, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
        }
      });

      if (!res.ok) {
        throw new Error(`Error del servidor: ${res.status}`);
      }

      const json = await res.json();
      
      if (json.error) {
        Alert.alert("Error del servidor", json.error);
        return;
      }

      setDatosFactura(json);
      await guardarEnHistorial(json);
      Alert.alert("✅ Éxito", "Factura procesada correctamente");

    } catch (error) {
      console.error("Error procesarIA:", error);
      Alert.alert(
        "Error de conexión", 
        `No se pudo procesar la factura.\n\nDetalles: ${error.message}`
      );
    } finally {
      setCargando(false);
    }
  };

  const enviarARed = async () => {
    if (!datosFactura) {
      Alert.alert("Error", "No hay datos para enviar");
      return;
    }

    try {
      setCargando(true);
      const datosConSucursal = { 
        ...datosFactura, 
        sucursal: sucursalActual,
        fechaEnvio: new Date().toISOString()
      };

      const res = await fetch(`${urlServidor}/guardar-compartido`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(datosConSucursal),
      });

      if (!res.ok) {
        throw new Error(`Error del servidor: ${res.status}`);
      }

      const resultado = await res.json();
      
      Alert.alert("✅ ¡Éxito!", `Factura guardada en buzón de ${sucursalActual}`);
      setFoto(null);
      setDatosFactura(null);

    } catch (error) {
      console.error("Error enviarARed:", error);
      Alert.alert(
        "Error de envío", 
        `No se pudo guardar en el servidor.\n\nDetalles: ${error.message}`
      );
    } finally {
      setCargando(false);
    }
  };

  const cambiarSucursal = async () => {
    Alert.alert(
      "Cambiar Sucursal",
      "¿Estás seguro? Se cerrará la sesión actual",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Confirmar", 
          onPress: async () => {
            await AsyncStorage.removeItem('@sucursal_actual');
            setSucursalActual(null);
            setMostrarLogin(true);
            setMenuAbierto(false);
            setFoto(null);
            setDatosFactura(null);
          }
        }
      ]
    );
  };

  const calcularTotalGastos = () => {
    return historial
      .filter(item => item.sucursal === sucursalActual)
      .reduce((acum, item) => acum + Number(item.monto || 0), 0);
  };

  const historialFiltrado = historial.filter(item =>
    item.sucursal === sucursalActual &&
    (item.empresa?.toLowerCase().includes(busqueda.toLowerCase()) || 
     item.numero?.toLowerCase().includes(busqueda.toLowerCase()))
  );

  const tomarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert("Permiso denegado", "Necesitamos acceso a la cámara");
      return;
    }

    setCargando(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        allowsEditing: false,
        base64: false
      });

      if (!result.canceled && result.assets?.length > 0) {
        setFoto(result.assets[0].uri);
        setDatosFactura(null);
      }
    } catch (err) {
      console.error("Error cámara:", err);
      Alert.alert('Error', 'No se pudo abrir la cámara');
    } finally {
      setCargando(false);
    }
  };

  const seleccionarGaleria = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets?.length > 0) {
        setFoto(result.assets[0].uri);
        setDatosFactura(null);
      }
    } catch (error) {
      console.error("Error galería:", error);
      Alert.alert("Error", "No se pudo seleccionar la imagen");
    }
  };

  // ==================== RENDER ====================
  if (mostrarLogin) {
    return (
      <View style={styles.loginContainer}>
        <Text style={styles.loginTitulo}>🏬 Scanner R21</Text>
        <Text style={styles.loginSubtitulo}>Ingrese nombre de sucursal</Text>
        <TextInput
          style={styles.inputLogin}
          placeholder="Ej: Minimarket LF"
          value={inputSucursal}
          onChangeText={setInputSucursal}
          autoCapitalize="words"
        />
        <TouchableOpacity style={styles.btnLogin} onPress={loginSucursal}>
          <Text style={styles.btnText}>INGRESAR AL SCANNER</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.mainWrapper}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.btnMenuHamburguesa} onPress={() => setMenuAbierto(true)}>
            <View style={styles.lineaHamburguesa} />
            <View style={styles.lineaHamburguesa} />
            <View style={styles.lineaHamburguesa} />
          </TouchableOpacity>
          <Text style={styles.header}>Scanner R21 - {sucursalActual}</Text>
        </View>

        {!foto ? (
          <View style={styles.menu}>
            <TouchableOpacity 
              style={styles.btnCeleste} 
              onPress={tomarFoto}
              disabled={cargando}
            >
              <Text style={styles.btnText}>📸 TOMAR FOTO DESDE CÁMARA</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.btnBlanco} 
              onPress={seleccionarGaleria}
              disabled={cargando}
            >
              <Text style={styles.btnTextAzul}>🖼️ AGREGAR DESDE GALERÍA</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.previaContainer}>
            <Image source={{ uri: foto }} style={styles.previa} />
            <View style={styles.row}>
              <TouchableOpacity 
                style={styles.btnChicoRojo} 
                onPress={() => {
                  setFoto(null); 
                  setDatosFactura(null);
                }}
                disabled={cargando}
              >
                <Text style={styles.btnText}>🗑️ PROBAR OTRA</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.btnChicoVerde} 
                onPress={procesarIA}
                disabled={cargando}
              >
                <Text style={styles.btnText}>
                  {cargando ? "⏳ PROCESANDO..." : "🔍 PROCESAR"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {cargando && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#00BCD4" />
            <Text style={styles.loadingText}>Procesando...</Text>
          </View>
        )}

        {datosFactura && (
          <View style={styles.resultados}>
            <View style={styles.cabeceraCard}>
              <Text style={styles.cabeceraTitulo}>🏛️ DATOS DE LA FACTURA</Text>
              <Text style={styles.cabeceraDato}>🏢 Vendedor: {datosFactura.nombreVendedor || 'No detectado'}</Text>
              <Text style={styles.cabeceraDato}>🆔 RUC Vendedor: {datosFactura.rucVendedor || 'No detectado'}</Text>
              <Text style={styles.cabeceraDato}>👤 RUC Comprador: {datosFactura.rucComprador || 'No detectado'}</Text>
              <Text style={styles.cabeceraDato}>📄 N° Factura: {datosFactura.numeroFactura || 'No detectado'}</Text>
              <Text style={styles.cabeceraDato}>🔢 Timbrado: {datosFactura.timbrado || 'No detectado'}</Text>
              <Text style={styles.cabeceraDato}>📅 Fecha: {datosFactura.fechaEmision || 'No detectado'}</Text>
            <View style={styles.totalContenedor}>
                <Text style={styles.detailSubtotal}>TOTAL GENERAL:</Text>
                <Text style={styles.detailSubtotal}>
                  {datosFactura.totalGeneral ? datosFactura.totalGeneral.toLocaleString('es-PY') : 0} Gs.
                </Text>
              </View>
            </View>
            

            <Text style={styles.label}>📦 Artículos Extraídos:</Text>
            
            {datosFactura.items && datosFactura.items.length > 0 ? (
              datosFactura.items.map((it, idx) => (
                <View key={idx} style={styles.card}>
                  <Text style={styles.labelItem}>📦 {it.descripcion || "Artículo sin descripción"}</Text>
                  <Text style={styles.detail}>Código: {it.codigo || "null"}</Text>
                  <Text style={styles.detail}>Barra: {it.codigo_barras || "null"}</Text>
                  <Text style={styles.detail}>Cant: {it.cantidad || 1} | Precio: {it.precio_unitario || 0} Gs.</Text>
                  <Text style={styles.detailSubtotal}>
                    Subtotal: {it.subtotal ? it.subtotal.toLocaleString('es-PY') : 0} Gs.
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.noItems}>No se detectaron artículos</Text>
            )}

            <View style={styles.rowBotones}>
              <TouchableOpacity 
                style={styles.btnPDF} 
                onPress={generarPDF}
                disabled={cargando}
              >
                <Text style={styles.btnTextGrande}>📄 PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.btnEnviarSistema} 
                onPress={enviarARed}
                disabled={cargando}
              >
                <Text style={styles.btnTextGrande}>🚀 ENVIAR</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* MODAL DE CONTRASEÑA */}
      <Modal
        visible={modalPassword}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setModalPassword(false);
          setPasswordInput('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitulo}>⚠️ Borrar Historial</Text>
            <Text style={styles.modalSubtitulo}>Esta acción es irreversible</Text>
            <Text style={styles.modalLabel}>Ingresa la contraseña:</Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="Contraseña"
              value={passwordInput}
              onChangeText={setPasswordInput}
              secureTextEntry={true}
              autoFocus={true}
            />

            <View style={styles.modalBotones}>
              <TouchableOpacity 
                style={styles.btnModalCancelar}
                onPress={() => {
                  setModalPassword(false);
                  setPasswordInput('');
                }}
              >
                <Text style={styles.btnModalTexto}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.btnModalConfirmar}
                onPress={confirmarBorrado}
              >
                <Text style={styles.btnModalTextoConfirmar}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {menuAbierto && (
        <TouchableOpacity 
          style={styles.capaOscura} 
          onPress={() => setMenuAbierto(false)} 
          activeOpacity={1}
        />
      )}

      {menuAbierto && (
        <View style={styles.drawerMenu}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTituloHeader}>Menú R21</Text>
            <TouchableOpacity onPress={() => setMenuAbierto(false)}>
              <Text style={styles.btnCerrarX}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tarjetaGastoTotal}>
            <Text style={styles.gastoTotalLabel}>💰 TOTAL ACUMULADO ({sucursalActual})</Text>
            <Text style={styles.gastoTotalMonto}>
              {calcularTotalGastos().toLocaleString('es-PY')} ₲
            </Text>
            <Text style={styles.gastoTotalSub}>{historialFiltrado.length} facturas</Text>
          </View>

          <TouchableOpacity 
            style={styles.btnBorrarHistorial} 
            onPress={borrarHistorialConPass}
          >
            <Text style={styles.btnBorrarText}>🗑️ Borrar Historial</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.btnCambiarSucursal} 
            onPress={cambiarSucursal}
          >
            <Text style={styles.btnCambiarText}>🔄 Cambiar Sucursal</Text>
          </TouchableOpacity>

          <Text style={styles.drawerLabelSeccion}>📋 Historial de Facturas</Text>
          
          <TextInput
            style={styles.buscadorInput}
            placeholder="Buscar por empresa o número..."
            value={busqueda}
            onChangeText={setBusqueda}
          />

          <ScrollView style={styles.scrollHistorial}>
            {historialFiltrado.length > 0 ? (
              historialFiltrado.map((item) => (
                <View key={item.id} style={styles.tarjetaHistorialDrawer}>
                  <View style={styles.historialInfo}>
                    <Text style={styles.empresaHistorialDrawer}>{item.empresa}</Text>
                    <Text style={styles.detalleHistorial}>N°: {item.numero}</Text>
                    <Text style={styles.detalleHistorial}>{item.fechaEscaneo}</Text>
                  </View>
                  <Text style={styles.montoHistorialDrawer}>
                    {Number(item.monto).toLocaleString('es-PY')} ₲
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.sinResultados}>
                {busqueda ? "No se encontraron resultados" : "No hay facturas registradas"}
              </Text>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mainWrapper: { flex: 1, backgroundColor: '#E0F7FA' },
  container: { padding: 25, alignItems: 'center', minHeight: '100%' },
  loginContainer: { 
    flex: 1, 
    backgroundColor: '#E0F7FA', 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 30 
  },
  loginTitulo: { 
    fontSize: 34, 
    fontWeight: 'bold', 
    color: '#006064', 
    marginBottom: 10 
  },
  loginSubtitulo: { 
    fontSize: 18, 
    color: '#00838F', 
    marginBottom: 50 
  },
  inputLogin: { 
    borderWidth: 1, 
    borderColor: '#00838F', 
    padding: 15, 
    borderRadius: 10, 
    marginBottom: 20, 
    width: '100%', 
    backgroundColor: '#FFF' 
  },
  btnLogin: { 
    backgroundColor: '#00838F', 
    padding: 20, 
    borderRadius: 18, 
    alignItems: 'center', 
    width: '100%' 
  },
  btnText: { 
    color: '#FFF', 
    fontWeight: 'bold', 
    fontSize: 17 
  },
  btnTextAzul: { 
    color: '#00BCD4', 
    fontWeight: 'bold', 
    fontSize: 17 
  },

  topBar: { 
    flexDirection: 'row', 
    width: '100%', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginTop: 40 
  },
  header: { 
    fontSize: 22, 
    fontWeight: 'bold', 
    color: '#006064' 
  },
  btnMenuHamburguesa: { 
    width: 35, 
    height: 25, 
    justifyContent: 'space-between', 
    padding: 5 
  },
  lineaHamburguesa: { 
    width: 28, 
    height: 4, 
    backgroundColor: '#006064', 
    borderRadius: 2 
  },

  menu: { width: '100%', gap: 20, marginTop: 30 },
  btnCeleste: { 
    backgroundColor: '#00BCD4', 
    paddingVertical: 24, 
    borderRadius: 20, 
    alignItems: 'center', 
    elevation: 6 
  },
  btnBlanco: { 
    backgroundColor: '#FFFFFF', 
    paddingVertical: 24, 
    borderRadius: 20, 
    alignItems: 'center', 
    borderWidth: 3, 
    borderColor: '#00BCD4', 
    elevation: 4 
  },

  row: { 
    flexDirection: 'row', 
    gap: 16, 
    width: '100%', 
    marginTop: 15 
  },
  btnChicoRojo: { 
    flex: 1, 
    backgroundColor: '#FF5252', 
    paddingVertical: 18, 
    borderRadius: 16, 
    alignItems: 'center', 
    elevation: 5 
  },
  btnChicoVerde: { 
    flex: 1, 
    backgroundColor: '#4CAF50', 
    paddingVertical: 18, 
    borderRadius: 16, 
    alignItems: 'center', 
    elevation: 5 
  },

  previaContainer: { width: '100%', alignItems: 'center' },
  previa: { 
    width: '100%', 
    height: 340, 
    borderRadius: 18, 
    marginBottom: 15 
  },

  loadingContainer: {
    marginTop: 30,
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 10,
    color: '#00838F',
    fontSize: 16,
    fontWeight: '600'
  },

  resultados: { width: '100%', marginTop: 20 },
  cabeceraCard: { 
    backgroundColor: '#FFFFFF', 
    padding: 18, 
    borderRadius: 15, 
    marginBottom: 15, 
    elevation: 3 
  },
  cabeceraTitulo: { 
    fontSize: 17, 
    fontWeight: 'bold', 
    color: '#006064', 
    marginBottom: 12 
  },
  cabeceraDato: { 
    fontSize: 14.5, 
    marginBottom: 7,
    color: '#424242'
  },
  label: { 
    fontWeight: 'bold', 
    fontSize: 18, 
    marginTop: 15, 
    marginBottom: 10, 
    color: '#006064' 
  },
  card: { 
    backgroundColor: '#FFF', 
    padding: 15, 
    borderRadius: 12, 
    marginBottom: 10, 
    borderLeftWidth: 5, 
    borderLeftColor: '#4DD0E1' 
  },
  labelItem: {
    fontWeight: 'bold',
    fontSize: 15,
    color: '#006064',
    marginBottom: 8
  },
  detail: {
    fontSize: 13,
    color: '#616161',
    marginBottom: 4
  },
  detailSubtotal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00838F',
    marginTop: 6
  },
  noItems: {
    textAlign: 'center',
    color: '#9E9E9E',
    fontSize: 15,
    marginVertical: 20
  },

  rowBotones: { 
    flexDirection: 'row', 
    gap: 15, 
    width: '100%', 
    marginTop: 25 
  },
  btnPDF: { 
    flex: 1, 
    backgroundColor: '#E53935', 
    paddingVertical: 22, 
    borderRadius: 18, 
    alignItems: 'center', 
    elevation: 6 
  },
  btnEnviarSistema: { 
    flex: 1, 
    backgroundColor: '#00838F', 
    paddingVertical: 22, 
    borderRadius: 18, 
    alignItems: 'center', 
    elevation: 6 
  },
  btnTextGrande: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16
  },

  // MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalContainer: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 25,
    width: '85%',
    elevation: 10
  },
  modalTitulo: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#EF5350',
    textAlign: 'center',
    marginBottom: 10
  },
  modalSubtitulo: {
    fontSize: 15,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 20
  },
  modalLabel: {
    fontSize: 15,
    color: '#424242',
    marginBottom: 10,
    fontWeight: '600'
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: '#F5F5F5'
  },
  modalBotones: {
    flexDirection: 'row',
    gap: 12
  },
  btnModalCancelar: {
    flex: 1,
    backgroundColor: '#BDBDBD',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  btnModalConfirmar: {
    flex: 1,
    backgroundColor: '#EF5350',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  btnModalTexto: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 15
  },
  btnModalTextoConfirmar: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 15
  },

  capaOscura: { 
    position: 'absolute', 
    top: 0, 
    bottom: 0, 
    left: 0, 
    right: 0, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    zIndex: 99 
  },
  drawerMenu: { 
    position: 'absolute', 
    top: 0, 
    bottom: 0, 
    left: 0, 
    width: '85%', 
    backgroundColor: '#FFFFFF', 
    zIndex: 100, 
    padding: 20, 
    paddingTop: 50 
  },
  drawerHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 15 
  },
  drawerTituloHeader: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: '#006064' 
  },
  btnCerrarX: { 
    fontSize: 26, 
    color: '#EF5350', 
    fontWeight: 'bold' 
  },

  tarjetaGastoTotal: { 
    backgroundColor: '#00838F', 
    padding: 16, 
    borderRadius: 14, 
    marginBottom: 15, 
    elevation: 4 
  },
  gastoTotalLabel: { 
    color: '#E0F7FA', 
    fontSize: 13, 
    fontWeight: 'bold' 
  },
  gastoTotalMonto: { 
    color: '#FFFFFF', 
    fontSize: 24, 
    fontWeight: 'bold', 
    marginVertical: 4 
  },
  gastoTotalSub: { 
    color: '#B2EBF2', 
    fontSize: 13 
  },

  btnBorrarHistorial: { 
    backgroundColor: '#EF5350', 
    padding: 14, 
    borderRadius: 12, 
    alignItems: 'center', 
    marginBottom: 15, 
    elevation: 3 
  },
  btnBorrarText: { 
    color: '#FFF', 
    fontWeight: 'bold', 
    fontSize: 15 
  },
  btnCambiarSucursal: { 
    backgroundColor: '#FF7043', 
    padding: 14, 
    borderRadius: 12, 
    alignItems: 'center', 
    marginBottom: 15 
  },
  btnCambiarText: { 
    color: '#FFF', 
    fontWeight: 'bold' 
  },

  drawerLabelSeccion: { 
    fontSize: 14, 
    fontWeight: 'bold', 
    color: '#006064', 
    marginTop: 15, 
    marginBottom: 8 
  },
  buscadorInput: { 
    backgroundColor: '#F5F5F5', 
    padding: 12, 
    borderRadius: 10, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: '#CFD8DC' 
  },
  scrollHistorial: {
    maxHeight: 300
  },
  tarjetaHistorialDrawer: { 
    backgroundColor: '#F9FBFB', 
    padding: 12, 
    borderRadius: 10, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#00BCD4'
  },
  historialInfo: {
    flex: 1
  },
  empresaHistorialDrawer: { 
    fontWeight: 'bold', 
    fontSize: 14.5,
    color: '#212121'
  },
  detalleHistorial: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2
  },
  montoHistorialDrawer: { 
    fontSize: 15, 
    fontWeight: 'bold', 
    color: '#00838F',
    alignSelf: 'center'
  },
  sinResultados: {
    textAlign: 'center',
    color: '#9E9E9E',
    fontSize: 14,
    marginTop: 20
  }
});