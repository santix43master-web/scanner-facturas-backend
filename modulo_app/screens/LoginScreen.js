import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { guardarSucursal } from '../utils/storage';

const SUCURSALES_PERMITIDAS = ["Minimarket LF", "Local 1"];

export default function LoginScreen({ onLogin }) {
  const { theme } = useTheme();
  const [inputSucursal, setInputSucursal] = useState('');

  const loginSucursal = async () => {
    const sucursal = inputSucursal.trim();
    if (SUCURSALES_PERMITIDAS.includes(sucursal)) {
      await guardarSucursal(sucursal);
      onLogin(sucursal);
    } else {
      Alert.alert("Error", "Sucursal no reconocida");
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.logo, { color: theme.primary }]}>R21</Text>
        <Text style={[styles.sub, { color: theme.textSecondary }]}>Scanner de Facturas</Text>
        <View style={[styles.divider, { backgroundColor: theme.primary }]} />
        <TextInput
          style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
          placeholder="Nombre de sucursal"
          placeholderTextColor={theme.textMuted}
          value={inputSucursal}
          onChangeText={setInputSucursal}
          autoCapitalize="words"
        />
        <TouchableOpacity style={[styles.btn, { backgroundColor: theme.primary }]} onPress={loginSucursal} activeOpacity={0.85}>
          <Text style={[styles.btnText, { color: theme.totalCardText }]}>INGRESAR</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.footer, { color: theme.textMuted }]}>Scanner R21 v1.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  card: { width: '100%', borderRadius: 24, padding: 36, alignItems: 'center', borderWidth: 1, elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 24 },
  logo: { fontSize: 44, fontWeight: '800', letterSpacing: 10, marginBottom: 4 },
  sub: { fontSize: 14, marginBottom: 24 },
  divider: { width: 50, height: 4, borderRadius: 2, marginBottom: 32 },
  input: { width: '100%', borderWidth: 1, padding: 16, borderRadius: 16, fontSize: 16, marginBottom: 20, textAlign: 'center' },
  btn: { width: '100%', paddingVertical: 18, borderRadius: 16, alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
  btnText: { fontWeight: '800', fontSize: 17, letterSpacing: 2 },
  footer: { fontSize: 12, marginTop: 40 },
});
