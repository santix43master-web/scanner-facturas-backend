import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../utils/ThemeContext';

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
  const { theme } = useTheme();
  const webViewRef = useRef(null);
  const captchaResueltoRef = useRef(false);

  if (!visible) return null;

  const handleNavChange = (navState) => {
    if (captchaResueltoRef.current) return;
    if ((navState.url || '').includes('ekuatia.set.gov.py') && !navState.url.includes('/qr?')) {
      captchaResueltoRef.current = true;
    }
  };

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'DE_DATA') onDatos(data);
    } catch {}
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.text }]}>Resolver captcha en SIFEN</Text>
        <TouchableOpacity style={[styles.cerrarBtn, { backgroundColor: theme.surfaceLight }]} onPress={onClose}>
          <Text style={[styles.cerrarText, { color: theme.textSecondary }]}>Cerrar</Text>
        </TouchableOpacity>
      </View>
      {onCargando && (
        <View style={[styles.cargandoBox, { backgroundColor: theme.overlay }]}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={{ color: '#FFF', marginTop: 12, fontSize: 15, fontWeight: '600' }}>Extrayendo datos del portal...</Text>
        </View>
      )}
      <WebView
        ref={webViewRef}
        source={{ uri: qrContent || "https://ekuatia.set.gov.py/consultas/" }}
        style={{ flex: 1 }}
        onNavigationStateChange={handleNavChange}
        onMessage={handleMessage}
        injectedJavaScript={CAPTCHA_INJECTED_JS}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, marginTop: 40, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: '700' },
  cerrarBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  cerrarText: { fontSize: 14, fontWeight: '600' },
  cargandoBox: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
});
