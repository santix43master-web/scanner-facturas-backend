import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

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

export default function CaptchaWebView({ visible, qrContent, onDatos, onCargando, onClose }) {
  const webViewRef = useRef(null);
  const captchaResueltoRef = useRef(false);

  if (!visible) return null;

  const handleNavChange = (navState) => {
    if (captchaResueltoRef.current) return;
    const url = navState.url || '';
    if (url.includes('ekuatia.set.gov.py') && !url.includes('/qr?')) {
      captchaResueltoRef.current = true;
    }
  };

  const handleWebViewMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'DE_DATA') {
        onDatos(data);
      }
    } catch (e) {
      console.error("Error parsing WebView message:", e);
    }
  };

  return (
    <View style={styles.captchaModalContainer}>
      <View style={styles.captchaModalHeader}>
        <Text style={styles.captchaModalTitulo}>Resolver captcha en SIFEN</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.captchaModalCerrar}>Cerrar</Text>
        </TouchableOpacity>
      </View>
      {onCargando && (
        <View style={styles.captchaCargandoBox}>
          <ActivityIndicator size="large" color="#00BCD4" />
          <Text style={{ color: '#FFF', marginTop: 10 }}>Extrayendo datos del portal...</Text>
        </View>
      )}
      <WebView
        ref={webViewRef}
        source={{ uri: qrContent || "https://ekuatia.set.gov.py/consultas/" }}
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
  );
}

const styles = StyleSheet.create({
  captchaModalContainer: {
    flex: 1, backgroundColor: '#0D1B2A', marginTop: 40,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden',
  },
  captchaModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#1B2838', paddingHorizontal: 16, paddingVertical: 14,
  },
  captchaModalTitulo: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  captchaModalCerrar: { color: '#90A4AE', fontSize: 14 },
  captchaCargandoBox: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
});
