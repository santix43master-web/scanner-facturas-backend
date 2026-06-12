import React, { useState, useEffect, useRef } from 'react';
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
  Animated,
  Linking,
  Vibration
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { CameraView } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { WebView } from 'react-native-webview';
import { actualizarPrecios } from './PriceTracker';
import Network from 'expo-network';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const comprimirImagen = async (uri, altaCalidad = false) => {
  try {
    const options = altaCalidad
      ? [{ resize: { width: 1600 } }]
      : [{ resize: { width: 1200 } }];
    const result = await ImageManipulator.manipulateAsync(
      uri,
      options,
      { compress: 0.45, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    return uri;
  }
};

export default function App() {
  const [sucursalActual, setSucursalActual] = useState(null);
  const [mostrarLogin, setMostrarLogin] = useState(true);
  const [inputSucursal, setInputSucursal] = useState('');

  const [fotos, setFotos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [datosFactura, setDatosFactura] = useState(null);
  const [historial, setHistorial] = useState([]); 
  
  const [urlServidor, setUrlServidor] = useState("https://scanner-facturas-backend.onrender.com");
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const [modalPassword, setModalPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [qrActivo, setQrActivo] = useState(false);
  const [qrCargando, setQrCargando] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const qrScaneado = useRef(false);
  const qrContentRef = useRef('');
  const webViewRef = useRef(null);
  const captchaResueltoRef = useRef(false);

  const [captchaVisible, setCaptchaVisible] = useState(false);
  const [captchaCargando, setCaptchaCargando] = useState(false);
  const [modalAgregar, setModalAgregar] = useState(false);
  const [cambiosPrecios, setCambiosPrecios] = useState([]);
  const [barcodeActivo, setBarcodeActivo] = useState(false);
  const [barcodeCargando, setBarcodeCargando] = useState(false);
  const [preciosHistorial, setPreciosHistorial] = useState([]);
  const [modalBarcodeManual, setModalBarcodeManual] = useState(false);
  const [inputBarcode, setInputBarcode] = useState('');

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
      if (sucursalGuardada) sincronizarHistorial();
    })();
  }, []);

  useEffect(() => {
    if (!mostrarLogin) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  }, [mostrarLogin]);

  const loginSucursal = async () => {
    const sucursal = inputSucursal.trim();
    const permitidas = ["Minimarket LF", "Local 1"];
    
    if (permitidas.includes(sucursal)) {
      setSucursalActual(sucursal);
      await AsyncStorage.setItem('@sucursal_actual', sucursal);
      setMostrarLogin(false);
      setInputSucursal('');
      sincronizarHistorial();
    } else {
      Alert.alert("Error", "Sucursal no reconocida");
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
        Alert.alert("Listo", "Historial borrado correctamente");
      } catch {
        Alert.alert("Error", "No se pudo borrar el historial");
      }
    } else {
      Alert.alert("Error", "Contraseña incorrecta");
      setPasswordInput('');
    }
  };

  const generarPDF = async () => {
  if (!datosFactura) {
    Alert.alert("Aviso", "Primero procesa una factura");
    return;
  }

  try {
    setCargando(true);

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
          <h1>FACTURA DIGITALIZADA</h1>
          <p>Scanner R21 - Sistema de Gestion</p>
        </div>

        <div class="info-section">
          <h2>INFORMACION GENERAL</h2>
          <div class="info-grid">
            <div class="info-item"><strong>SUCURSAL</strong><span>${sucursalActual}</span></div>
            <div class="info-item"><strong>FECHA DE ESCANEO</strong><span>${new Date().toLocaleDateString('es-PY', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
            <div class="info-item"><strong>VENDEDOR</strong><span>${datosFactura.nombreVendedor || 'No detectado'}</span></div>
            <div class="info-item"><strong>RUC VENDEDOR</strong><span>${datosFactura.rucVendedor || 'No detectado'}</span></div>
            <div class="info-item"><strong>RUC COMPRADOR</strong><span>${datosFactura.rucComprador || 'No detectado'}</span></div>
            <div class="info-item"><strong>N° FACTURA</strong><span>${datosFactura.numeroFactura || 'No detectado'}</span></div>
            <div class="info-item"><strong>TIMBRADO</strong><span>${datosFactura.timbrado || 'No detectado'}</span></div>
            <div class="info-item"><strong>FECHA EMISION</strong><span>${datosFactura.fechaEmision || 'No detectado'}</span></div>
          </div>
        </div>

        <div class="table-section">
          <h2>DETALLE DE ARTICULOS</h2>
          <table>
            <thead>
              <tr>
                <th style="text-align: center;">#</th>
                <th>DESCRIPCION</th>
                <th style="text-align: center;">CODIGO</th>
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
          <h3>TOTAL GENERAL</h3>
          <div class="amount">Gs ${Number(datosFactura.totalGeneral || 0).toLocaleString('es-PY')}</div>
        </div>

        <div class="footer">
          <p><strong>Scanner R21</strong> - Sistema de Digitalizacion de Facturas</p>
          <p>Documento generado el ${new Date().toLocaleString('es-PY')}</p>
          <p>© ${new Date().getFullYear()} - Todos los derechos reservados</p>
        </div>
      </body>
      </html>
    `;

    const { uri } = await Print.printToFileAsync({ 
      html: htmlContent,
      base64: false
    });

    const isAvailable = await Sharing.isAvailableAsync();
    
    if (isAvailable) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Compartir Factura PDF',
        UTI: 'com.adobe.pdf'
      });
      Alert.alert("Listo", "PDF generado correctamente");
    } else {
      Alert.alert("PDF Creado", "El archivo se guardo correctamente.");
    }

  } catch (error) {
    console.error("Error al generar PDF:", error);
    Alert.alert("Error", `No se pudo generar el PDF: ${error.message}`);
  } finally {
    setCargando(false);
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
      const formData = new FormData();
      for (let i = 0; i < fotos.length; i++) {
        const fotoComprimida = await comprimirImagen(fotos[i]);
        formData.append('factura', { 
          uri: fotoComprimida, 
          name: `factura_${i}.jpg`, 
          type: 'image/jpeg' 
        });
      }

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
      const cambios = await actualizarPrecios(json);
      if (cambios) setCambiosPrecios(cambios);
      await guardarEnHistorial(json);
      Vibration.vibrate(200);

    } catch (error) {
      console.error("Error procesarIA:", error);
      Alert.alert(
        "Error de conexion", 
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
      
      Alert.alert("Enviado", `Factura guardada en buzon de ${sucursalActual}`);
      setFotos([]);
      setDatosFactura(null);
      setMenuAbierto(false);

    } catch (error) {
      console.error("Error enviarARed:", error);
      Alert.alert(
        "Error de envio", 
        `No se pudo guardar en el servidor.\n\nDetalles: ${error.message}`
      );
    } finally {
      setCargando(false);
    }
  };

  const enviarACarpeta = async () => {
    if (!datosFactura) {
      Alert.alert("Error", "No hay datos para enviar");
      return;
    }

    try {
      const networkState = await Network.getNetworkStateAsync();
      if (!networkState.isConnected || networkState.type !== Network.NetworkStateType.WIFI) {
        Alert.alert(
          "Error de conexión",
          "No estás conectado a WiFi.\n\nPara enviar a la carpeta compartida necesitás estar en la red WiFi local.\n\nConectate a la red WiFi y volvé a intentar.\n\nSi el problema persiste, contactá al soporte."
        );
        return;
      }

      setCargando(true);
      const datosConSucursal = {
        ...datosFactura,
        sucursal: sucursalActual,
        fechaEnvio: new Date().toISOString()
      };

      const res = await fetch(`http://192.168.100.100:8080/guardar-compartido`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(datosConSucursal),
      });

      if (!res.ok) {
        throw new Error(`Error del servidor local: ${res.status}`);
      }

      Alert.alert("Guardado", `Factura enviada a carpeta compartida (${sucursalActual})`);
      setFotos([]);
      setDatosFactura(null);
      setMenuAbierto(false);

    } catch (error) {
      console.error("Error enviarACarpeta:", error);
      Alert.alert(
        "Error de red",
        `No se pudo conectar a la carpeta compartida.\n\nAsegúrate de estar en WiFi.\n\nDetalles: ${error.message}`
      );
    } finally {
      setCargando(false);
    }
  };

  const cambiarSucursal = async () => {
    Alert.alert(
      "Cambiar Sucursal",
      "Se cerrara la sesion actual",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Confirmar", 
          onPress: async () => {
            await AsyncStorage.removeItem('@sucursal_actual');
            setSucursalActual(null);
            setMostrarLogin(true);
            setMenuAbierto(false);
            setFotos([]);
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

  const escanearQR = async (qrContent) => {
    setQrCargando(true);
    try {
      const contenidoLimpio = qrContent.replace(/^DEMO\s*\n?/, '').trim();
      qrContentRef.current = contenidoLimpio;
      const res = await fetch(`${urlServidor}/procesar-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr: contenidoLimpio }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setQrActivo(false);
      setDatosFactura(json);
      const cambios = await actualizarPrecios(json);
      if (cambios) setCambiosPrecios(cambios);
      await guardarEnHistorial(json);
      Vibration.vibrate(200);
    } catch (error) {
      qrScaneado.current = false;
      Alert.alert("Error QR", `No se pudo procesar: ${error.message}`);
    } finally {
      setQrCargando(false);
    }
  };

  const buscarPrecios = async (codigo) => {
    if (!codigo) { Alert.alert("Error", "Ingresá un código"); return; }
    setPreciosHistorial([]);
    setBarcodeCargando(true);
    try {
      const res = await fetch(`${urlServidor}/buscar-producto/${encodeURIComponent(codigo)}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      if (json.resultados && json.resultados.length > 0) {
        setPreciosHistorial(json.resultados);
      } else {
        Alert.alert("Sin resultados", `No se encontraron precios para el código ${codigo}`);
      }
    } catch (e) {
      Alert.alert("Error", `No se pudo buscar: ${e.message}`);
    } finally {
      setBarcodeCargando(false);
    }
  };

  const escanearBarcode = async (codigo) => {
    setBarcodeActivo(false);
    await buscarPrecios(codigo);
  };

  const sincronizarHistorial = async () => {
    try {
      const res = await fetch(`${urlServidor}/historial/${encodeURIComponent(sucursalActual)}`);
      const json = await res.json();
      if (json.facturas && json.facturas.length > 0) {
        const localStr = await AsyncStorage.getItem('@facturas_r21');
        const local = localStr ? JSON.parse(localStr) : [];
        const idsRemotos = new Set(json.facturas.map(f => f.id));
        const sinDuplicar = local.filter(f => !idsRemotos.has(f.id));
        const todos = [...json.facturas.map(f => ({
          id: f.id,
          fechaEscaneo: f.fecha || '?',
          sucursal: sucursalActual,
          empresa: f.vendedor,
          rucVendedor: '',
          rucComprador: '',
          numero: f.numero,
          monto: f.total || 0,
        })), ...sinDuplicar];
        setHistorial(todos);
        await AsyncStorage.setItem('@facturas_r21', JSON.stringify(todos));
      }
    } catch {}
  };

  const abrirCaptcha = () => {
    captchaResueltoRef.current = false;
    setCaptchaVisible(true);
  };

  const handleNavChange = (navState) => {
    if (captchaResueltoRef.current) return;
    const url = navState.url || '';
    // Si la URL cambió (ya no es /qr?), probar inyectar JS por las dudas
    if (url.includes('ekuatia.set.gov.py') && !url.includes('/qr?')) {
      captchaResueltoRef.current = true;
    }
  };

  const CAPTCHA_INJECTED_JS = `
    (function() {
      var origOpen = XMLHttpRequest.prototype.open;
      var origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        return origOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function(body) {
        var xhr = this;
        xhr.addEventListener('load', function() {
          if (xhr._url && xhr._url.indexOf('documento-electronico') >= 0) {
            if (xhr.status === 200 && xhr.responseText) {
              try {
                var data = JSON.parse(xhr.responseText);
                if (data) {
                  var gcam = data.gCamItem || (data.DE || {}).gCamItem || ((data.DE || {}).gDtipDE || {}).gCamItem;
                  var hasItems = false;
                  if (Array.isArray(gcam) && gcam.length > 0) hasItems = true;
                  else if (gcam && gcam.gItem) hasItems = true;
                  if (hasItems) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'DE_DATA',
                      de_data: data,
                      url: window.location.href
                    }));
                  }
                }
              } catch(e) {}
            }
          }
        });
        return origSend.apply(this, arguments);
      };
      var pollCount = 0;
      function checkDOM() {
        pollCount++;
        var tables = document.querySelectorAll('table');
        var rows = document.querySelectorAll('tr');
        var text = document.body ? document.body.innerText : '';
        if (tables.length >= 2 && rows.length >= 4) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'DE_DATA',
            html: document.documentElement.outerHTML,
            url: window.location.href
          }));
        } else if (text.indexOf('Total') >= 0 && text.length > 500) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'DE_DATA',
            html: document.documentElement.outerHTML,
            url: window.location.href
          }));
        } else if (pollCount < 60) {
          setTimeout(checkDOM, 1500);
        }
      }
      setTimeout(checkDOM, 3000);
    })();
  `;

  const handleWebViewMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'DE_DATA') {
        procesarHtmlCompleto(data);
      }
    } catch (e) {
      console.error("Error parsing WebView message:", e);
    }
  };

  const procesarHtmlCompleto = async (data) => {
    setCaptchaCargando(true);
    try {
      const res = await fetch(`${urlServidor}/procesar-html-completo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: data.html || '',
          url: data.url || '',
          de_data: data.de_data || null,
          qr_params: { qr: qrContentRef.current },
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      if (!json.items || json.items.length === 0) throw new Error("sin items");
      setDatosFactura((prev) => ({ ...prev, ...json }));
      const cambios = await actualizarPrecios(json);
      if (cambios) setCambiosPrecios(cambios);
      await guardarEnHistorial(json);
      setCaptchaVisible(false);
    } catch (error) {
      setCaptchaCargando(false);
    }
  };

  const tomarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert("Permiso denegado", "Necesitamos acceso a la camara");
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.3,
        allowsEditing: false,
        base64: false
      });

      if (!result.canceled && result.assets?.length > 0) {
        setFotos(prev => [...prev, result.assets[0].uri]);
        setDatosFactura(null);
      }
    } catch (err) {
      console.error("Error camara:", err);
      Alert.alert('Error', 'No se pudo abrir la camara');
    }
  };

  const seleccionarGaleria = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.3,
      });

      if (!result.canceled && result.assets?.length > 0) {
        setFotos(prev => [...prev, result.assets[0].uri]);
        setDatosFactura(null);
      }
    } catch (error) {
      console.error("Error galeria:", error);
      Alert.alert("Error", "No se pudo seleccionar la imagen");
    }
  };

  if (mostrarLogin) {
    return (
      <View style={styles.loginContainer}>
        <View style={styles.loginCard}>
          <Text style={styles.loginIcono}>R21</Text>
          <Text style={styles.loginTitulo}>Scanner R21</Text>
          <Text style={styles.loginSubtitulo}>Sistema de Digitalizacion</Text>
          <View style={styles.loginSeparator} />
          <TextInput
            style={styles.inputLogin}
            placeholder="Nombre de sucursal"
            placeholderTextColor="#90A4AE"
            value={inputSucursal}
            onChangeText={setInputSucursal}
            autoCapitalize="words"
          />
          <TouchableOpacity style={styles.btnLogin} onPress={loginSucursal} activeOpacity={0.85}>
            <Text style={styles.btnLoginText}>INGRESAR</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.loginFooter}>Scanner R21 v1.0</Text>
      </View>
    );
  }

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

        {fotos.length === 0 ? (
          <View style={styles.menu}>
            <TouchableOpacity 
              style={styles.btnCamara} 
              onPress={tomarFoto}
              disabled={cargando}
              activeOpacity={0.85}
            >
              <Text style={styles.btnCamaraIcono}>📸</Text>
              <Text style={styles.btnCamaraText}>CÁMARA</Text>
              <Text style={styles.btnCamaraSub}>Escanear factura sin QR</Text>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>O</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity 
              style={styles.btnGaleria} 
              onPress={seleccionarGaleria}
              disabled={cargando}
              activeOpacity={0.85}
            >
              <Text style={styles.btnGaleriaIcono}>🖼</Text>
              <Text style={styles.btnGaleriaText}>GALERÍA</Text>
              <Text style={styles.btnGaleriaSub}>Escanear factura sin QR</Text>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>O</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity 
              style={styles.btnQR} 
              onPress={() => {
                setQrActivo(true);
                qrScaneado.current = false;
              }}
              disabled={cargando}
              activeOpacity={0.85}
            >
              <Text style={styles.btnQRIcono}>▦</Text>
              <Text style={styles.btnQRText}>QR</Text>
              <Text style={styles.btnQRSub}>Escanear factura con QR</Text>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>O</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity 
              style={styles.btnBarcode} 
              onPress={() => { setBarcodeActivo(true); }}
              disabled={cargando}
              activeOpacity={0.85}
            >
              <Text style={styles.btnBarcodeIcono}>≡</Text>
              <Text style={styles.btnBarcodeText}>CÓDIGO DE BARRAS</Text>
              <Text style={styles.btnBarcodeSub}>Escanear código para ver historial de precios</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.btnBarcodeManual} 
              onPress={() => { setModalBarcodeManual(true); setInputBarcode(''); }}
              disabled={cargando}
              activeOpacity={0.85}
            >
              <Text style={styles.btnBarcodeManualIcono}>⌨</Text>
              <Text style={styles.btnBarcodeManualText}>INGRESAR CÓDIGO</Text>
              <Text style={styles.btnBarcodeManualSub}>Tipear código de barras para buscar precios</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.previaContainer}>
            <Text style={styles.paginasLabel}>Paginas ({fotos.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.paginasScroll}>
              {fotos.map((f, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => {
                    const nuevas = fotos.filter((_, idx) => idx !== i);
                    setFotos(nuevas);
                    if (nuevas.length === 0) setDatosFactura(null);
                  }}
                >
                  <Image source={{ uri: f }} style={styles.paginaMini} />
                  <View style={styles.paginaBorrar}>
                    <Text style={styles.paginaBorrarText}>X</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.row}>
              <TouchableOpacity 
                style={styles.btnAgregar} 
                onPress={() => setModalAgregar(true)}
                disabled={cargando}
                activeOpacity={0.85}
              >
                <Text style={styles.btnChicoText}>+ AGREGAR</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.btnProcesar} 
                onPress={procesarIA}
                disabled={cargando}
                activeOpacity={0.85}
              >
                <Text style={styles.btnChicoText}>
                  {cargando ? "PROCESANDO..." : `PROCESAR (${fotos.length})`}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity 
              style={styles.btnReiniciar} 
              onPress={() => {
                setFotos([]); 
                setDatosFactura(null);
              }}
              disabled={cargando}
            >
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
                <TouchableOpacity style={styles.btnCaptcha} onPress={abrirCaptcha} activeOpacity={0.85}>
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
                    <View style={styles.cardNumero}>
                      <Text style={styles.cardNumeroText}>{idx + 1}</Text>
                    </View>
                    <Text style={styles.cardDescripcion} numberOfLines={2}>{it.descripcion || "Sin descripcion"}</Text>
                  </View>
                  <View style={styles.cardDetalles}>
                    {it.codigo ? <Text style={styles.cardTag}>Cod: {it.codigo}</Text> : null}
                    {it.codigo_barras ? <Text style={styles.cardTag}>EAN: {it.codigo_barras}</Text> : null}
                    <Text style={styles.cardPrecio}>
                      {it.cantidad || 1} x {Number(it.precio_unitario || 0).toLocaleString('es-PY')} Gs.
                    </Text>
                  </View>
                  <Text style={styles.cardSubtotal}>
                    Subtotal: {it.subtotal ? it.subtotal.toLocaleString('es-PY') : 0} Gs.
                  </Text>
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
              )})
            ) : (
              <View style={styles.noItemsCard}>
                <Text style={styles.noItemsText}>No se detectaron articulos</Text>
              </View>
            )}

            <View style={styles.rowBotones}>
              <TouchableOpacity 
                style={styles.btnPDF} 
                onPress={generarPDF}
                disabled={cargando}
                activeOpacity={0.85}
              >
                <Text style={styles.btnAccionText}>PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.btnEnviar} 
                onPress={enviarARed}
                disabled={cargando}
                activeOpacity={0.85}
              >
                <Text style={styles.btnAccionText}>ENVIAR</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.btnCarpeta}
              onPress={enviarACarpeta}
              disabled={cargando}
              activeOpacity={0.85}
            >
              <Text style={styles.btnAccionText}>CARPETA COMPARTIDA</Text>
            </TouchableOpacity>
          </View>
        )}

        {preciosHistorial.length > 0 && (
          <View style={styles.preciosSection}>
            <Text style={styles.sectionTitulo}>Historial de Precios</Text>
            {preciosHistorial.map((p, i) => (
              <View key={i} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardNumero}>
                    <Text style={styles.cardNumeroText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.cardDescripcion} numberOfLines={2}>{p.descripcion || 'Producto'}</Text>
                </View>
                <View style={styles.cardDetalles}>
                  <Text style={styles.cardTag}>{p.vendedor}</Text>
                  <Text style={styles.cardTag}>{p.fecha}</Text>
                  <Text style={styles.cardPrecio}>{Number(p.precio).toLocaleString('es-PY')} Gs</Text>
                </View>
                <Text style={styles.cardSubtotal}>Factura N° {p.factura}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {qrActivo && (
        <View style={styles.qrOverlay}>
          <CameraView
            style={styles.qrCamera}
            facing="back"
            onBarcodeScanned={qrScaneado.current ? undefined : (result) => {
              qrScaneado.current = true;
              escanearQR(result.data);
            }}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          >
            <View style={styles.qrHeader}>
              {qrCargando ? (
                <View style={styles.qrCargandoBox}>
                  <ActivityIndicator size="large" color="#00BCD4" />
                  <Text style={{ color: '#FFFFFF', marginTop: 10, fontSize: 15 }}>Procesando factura desde SIFEN...</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.qrTitulo}>Escanea el QR de la factura</Text>
                  <Text style={styles.qrSub}>Buscá el código QR en la factura electrónica</Text>
                </>
              )}
            </View>
            <View style={styles.qrMarco}>
              <View style={styles.qrEsquinaTL} />
              <View style={styles.qrEsquinaTR} />
              <View style={styles.qrEsquinaBL} />
              <View style={styles.qrEsquinaBR} />
            </View>
            <TouchableOpacity style={styles.qrCancelar} onPress={() => {
              setQrActivo(false);
              qrScaneado.current = false;
            }}>
              <Text style={styles.qrCancelarText}>Cancelar</Text>
            </TouchableOpacity>
          </CameraView>
        </View>
      )}

      {barcodeActivo && (
        <View style={styles.qrOverlay}>
          <CameraView
            style={styles.qrCamera}
            facing="back"
            onBarcodeScanned={({ data }) => {
              if (data) escanearBarcode(data);
            }}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'code128', 'code39', 'itf14'] }}
          >
            <View style={styles.qrHeader}>
              <Text style={styles.qrTitulo}>Escanea el código de barras</Text>
              <Text style={styles.qrSub}>Buscá el código de barras del producto</Text>
            </View>
            <View style={styles.qrMarco}>
              <View style={styles.qrEsquinaTL} />
              <View style={styles.qrEsquinaTR} />
              <View style={styles.qrEsquinaBL} />
              <View style={styles.qrEsquinaBR} />
            </View>
            <View style={styles.barcodeInfo}>
              {barcodeCargando ? (
                <ActivityIndicator size="large" color="#00BCD4" />
              ) : (
                <Text style={styles.barcodeInfoText}>Apunta al código de barras del producto</Text>
              )}
            </View>
            <TouchableOpacity style={styles.qrCancelar} onPress={() => { setBarcodeActivo(false); }}>
              <Text style={styles.qrCancelarText}>Cancelar</Text>
            </TouchableOpacity>
          </CameraView>
        </View>
      )}

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

      <Modal
        visible={captchaVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCaptchaVisible(false)}
      >
        <View style={styles.captchaModalContainer}>
          <View style={styles.captchaModalHeader}>
            <Text style={styles.captchaModalTitulo}>Resolver captcha en SIFEN</Text>
            <TouchableOpacity onPress={() => setCaptchaVisible(false)}>
              <Text style={styles.captchaModalCerrar}>Cerrar</Text>
            </TouchableOpacity>
          </View>
          {captchaCargando && (
            <View style={styles.captchaCargandoBox}>
              <ActivityIndicator size="large" color="#00BCD4" />
              <Text style={{ color: '#FFF', marginTop: 10 }}>Extrayendo datos del portal...</Text>
            </View>
          )}
          <WebView
            ref={webViewRef}
            source={{ uri: qrContentRef.current || "https://ekuatia.set.gov.py/consultas/" }}
            style={{ flex: 1 }}
            onNavigationStateChange={handleNavChange}
            onMessage={handleWebViewMessage}
            injectedJavaScript={CAPTCHA_INJECTED_JS}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
          />
        </View>
      </Modal>

      <Modal
        visible={modalAgregar}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalAgregar(false)}
      >
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

      <Modal
        visible={modalBarcodeManual}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalBarcodeManual(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitulo}>Buscar por código de barras</Text>
            <Text style={styles.modalSubtitulo}>Ingresá el código de barras del producto</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Código de barras"
              placeholderTextColor="#90A4AE"
              value={inputBarcode}
              onChangeText={setInputBarcode}
              autoFocus={true}
              keyboardType="numeric"
            />
            <View style={styles.modalBotones}>
              <TouchableOpacity 
                style={styles.btnModalCancelar}
                onPress={() => setModalBarcodeManual(false)}
              >
                <Text style={styles.btnModalTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.btnModalConfirmar}
                onPress={() => {
                  setModalBarcodeManual(false);
                  buscarPrecios(inputBarcode.trim());
                }}
              >
                <Text style={styles.btnModalTextoConfirmar}>Buscar</Text>
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
            <Text style={styles.drawerTitulo}>R21</Text>
            <TouchableOpacity onPress={() => setMenuAbierto(false)}>
              <Text style={styles.drawerCerrar}>X</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.drawerResumen}>
            <Text style={styles.drawerResumenLabel}>TOTAL ACUMULADO</Text>
            <Text style={styles.drawerResumenMonto}>
              {calcularTotalGastos().toLocaleString('es-PY')} Gs.
            </Text>
            <Text style={styles.drawerResumenSub}>{historialFiltrado.length} facturas</Text>
          </View>

          <TouchableOpacity 
            style={styles.drawerBtnPeligro} 
            onPress={borrarHistorialConPass}
          >
            <Text style={styles.drawerBtnText}>Borrar Historial</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.drawerBtnSecundario} 
            onPress={cambiarSucursal}
          >
            <Text style={styles.drawerBtnTextSec}>Cambiar Sucursal</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.drawerBtnSoporte} 
            onPress={() => Linking.openURL("https://wa.me/595981644728")}
          >
            <Text style={styles.drawerBtnTextSec}>Contactar Soporte</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.drawerBtnSync} 
            onPress={() => {
              sincronizarHistorial();
              Alert.alert("Sincronizado", "Historial actualizado desde el servidor");
            }}
          >
            <Text style={styles.drawerBtnTextSec}>Sincronizar Historial</Text>
          </TouchableOpacity>

          <Text style={styles.drawerSeccionTitulo}>Historial de Facturas</Text>
          
          <TextInput
            style={styles.drawerBuscador}
            placeholder="Buscar..."
            placeholderTextColor="#90A4AE"
            value={busqueda}
            onChangeText={setBusqueda}
          />

          <ScrollView style={styles.drawerScroll}>
            {historialFiltrado.length > 0 ? (
              historialFiltrado.map((item) => (
                <View key={item.id} style={styles.drawerItem}>
                  <View style={styles.drawerItemInfo}>
                    <Text style={styles.drawerItemEmpresa} numberOfLines={1}>{item.empresa}</Text>
                    <Text style={styles.drawerItemDetalle}>N°: {item.numero}</Text>
                    <Text style={styles.drawerItemDetalle}>{item.fechaEscaneo}</Text>
                  </View>
                  <Text style={styles.drawerItemMonto}>
                    {Number(item.monto).toLocaleString('es-PY')} Gs.
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.drawerVacio}>
                {busqueda ? "Sin resultados" : "Sin facturas registradas"}
              </Text>
            )}
          </ScrollView>
        </View>
      )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  mainWrapper: { flex: 1, backgroundColor: '#0D1B2A' },
  container: { padding: 20, alignItems: 'center', minHeight: '100%' },

  loginContainer: {
    flex: 1,
    backgroundColor: '#0D1B2A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  loginCard: {
    backgroundColor: '#1B2838',
    width: '100%',
    borderRadius: 24,
    padding: 35,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A3F4F',
  },
  loginIcono: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#00BCD4',
    letterSpacing: 6,
    marginBottom: 5,
  },
  loginTitulo: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  loginSubtitulo: {
    fontSize: 14,
    color: '#78909C',
    marginBottom: 25,
  },
  loginSeparator: {
    width: 50,
    height: 3,
    backgroundColor: '#00BCD4',
    borderRadius: 2,
    marginBottom: 30,
  },
  inputLogin: {
    borderWidth: 1,
    borderColor: '#2A3F4F',
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
    width: '100%',
    backgroundColor: '#0D1B2A',
    color: '#FFFFFF',
    fontSize: 16,
  },
  btnLogin: {
    backgroundColor: '#00BCD4',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    width: '100%',
  },
  btnLoginText: {
    color: '#0D1B2A',
    fontWeight: 'bold',
    fontSize: 17,
    letterSpacing: 2,
  },
  loginFooter: {
    color: '#546E7A',
    fontSize: 12,
    marginTop: 30,
  },

  topBar: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 50,
    marginBottom: 10,
  },
  header: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  badgeSucursal: {
    backgroundColor: '#00BCD4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeSucursalText: {
    color: '#0D1B2A',
    fontSize: 12,
    fontWeight: 'bold',
  },
  btnMenuHamburguesa: {
    width: 32,
    height: 24,
    justifyContent: 'space-between',
    padding: 2,
  },
  lineaHamburguesa: {
    width: 28,
    height: 3,
    backgroundColor: '#00BCD4',
    borderRadius: 2,
  },

  menu: { width: '100%', marginTop: 30 },
  btnCamara: {
    backgroundColor: '#1B2838',
    paddingVertical: 30,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#00BCD4',
  },
  btnCamaraIcono: {
    fontSize: 40,
    marginBottom: 10,
  },
  btnCamaraText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 18,
    letterSpacing: 2,
  },
  btnCamaraSub: {
    color: '#78909C',
    fontSize: 13,
    marginTop: 6,
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 25,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2A3F4F',
  },
  dividerText: {
    color: '#546E7A',
    marginHorizontal: 15,
    fontSize: 13,
  },

  btnGaleria: {
    backgroundColor: '#1B2838',
    paddingVertical: 28,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#546E7A',
  },
  btnGaleriaIcono: {
    fontSize: 36,
    marginBottom: 10,
  },
  btnGaleriaText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
  },
  btnGaleriaSub: {
    color: '#78909C',
    fontSize: 13,
    marginTop: 6,
  },

  previaContainer: { width: '100%', alignItems: 'center' },
  previaWrapper: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#2A3F4F',
  },
  previa: {
    width: '100%',
    height: 340,
  },
  previaBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  previaBadgeText: {
    color: '#00BCD4',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
  },

  row: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 18,
  },
  btnCancelar: {
    flex: 1,
    backgroundColor: '#37474F',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  btnProcesar: {
    flex: 1,
    backgroundColor: '#00BCD4',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  btnChicoText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
    letterSpacing: 1,
  },

  loadingOverlay: {
    marginTop: 40,
    backgroundColor: 'rgba(0,188,212,0.15)',
    paddingVertical: 25,
    paddingHorizontal: 30,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#00BCD4',
    alignItems: 'center',
    width: '100%',
  },
  loadingText: {
    marginTop: 12,
    color: '#00BCD4',
    fontSize: 15,
    fontWeight: '600',
  },

  resultados: { width: '100%', marginTop: 25 },
  resultadosHeader: {
    marginBottom: 15,
  },
  resultadosTitulo: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1,
  },

  infoGrid: {
    backgroundColor: '#1B2838',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A3F4F',
  },
  infoItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3F4F',
  },
  infoLabel: {
    color: '#00BCD4',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 2,
  },
  infoValor: {
    color: '#FFFFFF',
    fontSize: 15,
  },

  totalCard: {
    backgroundColor: '#00BCD4',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 15,
  },
  totalLabel: {
    color: '#0D1B2A',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
    opacity: 0.8,
  },
  totalMonto: {
    color: '#0D1B2A',
    fontSize: 26,
    fontWeight: 'bold',
    marginTop: 4,
  },

  sectionTitulo: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 25,
    marginBottom: 12,
  },

  card: {
    backgroundColor: '#1B2838',
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A3F4F',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardNumero: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#00BCD4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  cardNumeroText: {
    color: '#0D1B2A',
    fontWeight: 'bold',
    fontSize: 12,
  },
  cardDescripcion: {
    flex: 1,
    fontWeight: 'bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  cardDetalles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
    marginLeft: 36,
  },
  cardTag: {
    backgroundColor: '#2A3F4F',
    color: '#B0BEC5',
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cardPrecio: {
    color: '#78909C',
    fontSize: 13,
    marginLeft: 36,
  },
  cardSubtotal: {
    color: '#00BCD4',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 36,
    marginTop: 4,
  },

  noItemsCard: {
    backgroundColor: '#1B2838',
    padding: 25,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A3F4F',
  },
  noItemsText: {
    color: '#78909C',
    fontSize: 14,
  },

  rowBotones: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 20,
    marginBottom: 30,
  },
  btnPDF: {
    flex: 1,
    backgroundColor: '#E53935',
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  btnEnviar: {
    flex: 1,
    backgroundColor: '#00BCD4',
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  btnCarpeta: {
    backgroundColor: '#FF8F00',
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    width: '100%',
    marginBottom: 10,
  },
  btnAccionText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#1B2838',
    borderRadius: 20,
    padding: 25,
    width: '85%',
    borderWidth: 1,
    borderColor: '#2A3F4F',
  },
  modalTitulo: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#EF5350',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitulo: {
    fontSize: 14,
    color: '#78909C',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#2A3F4F',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: '#0D1B2A',
    color: '#FFFFFF',
  },
  modalBotones: {
    flexDirection: 'row',
    gap: 12,
  },
  btnModalCancelar: {
    flex: 1,
    backgroundColor: '#37474F',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnModalConfirmar: {
    flex: 1,
    backgroundColor: '#EF5350',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnModalTexto: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  btnModalTextoConfirmar: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },

  capaOscura: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 99,
  },
  drawerMenu: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '82%',
    backgroundColor: '#1B2838',
    zIndex: 100,
    padding: 20,
    paddingTop: 50,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
  },
  drawerTitulo: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#00BCD4',
    letterSpacing: 4,
  },
  drawerCerrar: {
    fontSize: 22,
    color: '#78909C',
    fontWeight: 'bold',
  },

  drawerResumen: {
    backgroundColor: '#0D1B2A',
    padding: 18,
    borderRadius: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#00BCD4',
  },
  drawerResumenLabel: {
    color: '#00BCD4',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  drawerResumenMonto: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginVertical: 4,
  },
  drawerResumenSub: {
    color: '#78909C',
    fontSize: 12,
  },

  drawerBtnPeligro: {
    backgroundColor: '#EF5350',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  drawerBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  drawerBtnSecundario: {
    backgroundColor: '#37474F',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  drawerBtnSoporte: {
    backgroundColor: '#00695C',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  drawerBtnTextSec: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },

  drawerSeccionTitulo: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
    letterSpacing: 1,
  },
  drawerBuscador: {
    backgroundColor: '#0D1B2A',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A3F4F',
    color: '#FFFFFF',
  },
  drawerScroll: {
    maxHeight: 300,
  },
  drawerItem: {
    backgroundColor: '#0D1B2A',
    padding: 12,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#00BCD4',
  },
  drawerItemInfo: {
    flex: 1,
  },
  drawerItemEmpresa: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  drawerItemDetalle: {
    fontSize: 12,
    color: '#78909C',
    marginTop: 2,
  },
  drawerItemMonto: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00BCD4',
    alignSelf: 'center',
  },
  drawerVacio: {
    textAlign: 'center',
    color: '#546E7A',
    fontSize: 14,
    marginTop: 20,
  },

  btnQR: {
    backgroundColor: '#004D40',
    paddingVertical: 28,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#00897B',
  },
  btnQRIcono: {
    fontSize: 36,
    marginBottom: 10,
    color: '#80CBC4',
  },
  btnQRText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
  },
  btnQRSub: {
    color: '#80CBC4',
    fontSize: 13,
    marginTop: 6,
  },

  qrOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 200,
  },
  qrCamera: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 60,
  },
  qrHeader: {
    alignItems: 'center',
  },
  qrTitulo: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    overflow: 'hidden',
  },
  qrSub: {
    color: '#B0BEC5',
    fontSize: 13,
    marginTop: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  qrMarco: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  qrEsquinaTL: {
    position: 'absolute',
    top: 0, left: 0,
    width: 40, height: 40,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#00BCD4',
  },
  qrEsquinaTR: {
    position: 'absolute',
    top: 0, right: 0,
    width: 40, height: 40,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: '#00BCD4',
  },
  qrEsquinaBL: {
    position: 'absolute',
    bottom: 0, left: 0,
    width: 40, height: 40,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#00BCD4',
  },
  qrEsquinaBR: {
    position: 'absolute',
    bottom: 0, right: 0,
    width: 40, height: 40,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: '#00BCD4',
  },
  qrCancelar: {
    backgroundColor: 'rgba(239,83,80,0.9)',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 30,
  },
  qrCancelarText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  qrCargandoBox: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 30,
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
  },

  paginasLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  paginasScroll: {
    maxHeight: 160,
    marginBottom: 15,
  },
  paginaMini: {
    width: 100,
    height: 140,
    borderRadius: 10,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#00BCD4',
  },
  paginaBorrar: {
    position: 'absolute',
    top: -6,
    right: 4,
    backgroundColor: '#EF5350',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paginaBorrarText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  btnAgregar: {
    flex: 1,
    backgroundColor: '#37474F',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#546E7A',
  },
  btnReiniciar: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnReiniciarText: {
    color: '#78909C',
    fontSize: 13,
    textDecorationLine: 'underline',
  },

  captchaBanner: {
    backgroundColor: '#1B2838',
    padding: 16,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#F9A825',
    alignItems: 'center',
  },
  captchaBannerText: {
    color: '#FFE082',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  btnCaptcha: {
    backgroundColor: '#F9A825',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  btnCaptchaText: {
    color: '#1B2838',
    fontWeight: 'bold',
    fontSize: 14,
  },

  captchaModalContainer: {
    flex: 1,
    backgroundColor: '#0D1B2A',
    marginTop: 40,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  captchaModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1B2838',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  captchaModalTitulo: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  captchaModalCerrar: {
    color: '#90A4AE',
    fontSize: 14,
  },
  captchaCargandoBox: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },

  agregarModal: {
    backgroundColor: '#1B2838',
    marginHorizontal: 40,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  agregarTitulo: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  agregarSub: {
    color: '#90A4AE',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  agregarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D1B2A',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    width: '100%',
  },
  agregarIcono: {
    fontSize: 22,
    marginRight: 14,
  },
  agregarTexto: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  agregarDivider: {
    height: 1,
    backgroundColor: '#2C3E50',
    width: '100%',
    marginVertical: 10,
  },
  agregarCancelar: {
    marginTop: 16,
    paddingVertical: 10,
  },
  agregarCancelarText: {
    color: '#78909C',
    fontSize: 14,
  },
  precioCambioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 36,
    marginTop: 6,
  },
  precioCambioIcono: {
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 6,
  },
  precioCambioTexto: {
    fontSize: 12,
    fontWeight: '600',
  },
  btnBarcode: {
    backgroundColor: '#1B2838',
    paddingVertical: 24,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#66BB6A',
  },
  btnBarcodeIcono: {
    fontSize: 36,
    marginBottom: 8,
    color: '#66BB6A',
  },
  btnBarcodeText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
  },
  btnBarcodeSub: {
    color: '#78909C',
    fontSize: 13,
    marginTop: 6,
  },
  btnBarcodeManual: {
    backgroundColor: '#1B2838',
    paddingVertical: 24,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFA726',
    marginTop: 15,
  },
  btnBarcodeManualIcono: {
    fontSize: 32,
    marginBottom: 8,
  },
  btnBarcodeManualText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
  },
  btnBarcodeManualSub: {
    color: '#78909C',
    fontSize: 13,
    marginTop: 6,
  },
  barcodeInfo: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  barcodeInfoText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  preciosSection: {
    width: '100%',
    marginTop: 25,
  },
  drawerBtnSync: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginHorizontal: 15,
    marginBottom: 8,
    backgroundColor: '#1B2838',
    borderWidth: 1,
    borderColor: '#00BCD4',
  },
});
