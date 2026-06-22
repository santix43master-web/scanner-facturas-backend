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
      <Text style={[styles.logo, { color: theme.primary }]}>R21</Text>
      <Text style={[styles.sub, { color: theme.textSecondary }]}>Scanner</Text>
      <TextInput
        style={[styles.input, { borderColor: theme.border, color: theme.text }]}
        placeholder="Sucursal"
        placeholderTextColor={theme.textMuted}
        value={inputSucursal}
        onChangeText={setInputSucursal}
        autoCapitalize="words"
      />
      <TouchableOpacity onPress={loginSucursal}>
        <Text style={[styles.btn, { color: theme.primary }]}>Ingresar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  logo: { fontSize: 48, fontWeight: '200', letterSpacing: 12, marginBottom: 4 },
  sub: { fontSize: 14, marginBottom: 40, letterSpacing: 2 },
  input: { borderBottomWidth: 1, padding: 12, width: '100%', fontSize: 16, marginBottom: 24, textAlign: 'center' },
  btn: { fontSize: 16, fontWeight: '500', letterSpacing: 2 },
});
