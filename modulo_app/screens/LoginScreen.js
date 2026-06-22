import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
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
      await ImagePicker.requestMediaLibraryPermissionsAsync();
      await ImagePicker.requestCameraPermissionsAsync();
      onLogin(sucursal);
    } else {
      Alert.alert("Error", "Sucursal no reconocida");
    }
  };

  return (
    <View style={[styles.loginContainer, { backgroundColor: theme.background }]}>
      <View style={[styles.loginCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.loginIcono, { color: theme.primary }]}>R21</Text>
        <Text style={[styles.loginTitulo, { color: theme.text }]}>Scanner R21</Text>
        <Text style={[styles.loginSubtitulo, { color: theme.textSecondary }]}>Sistema de Digitalizacion</Text>
        <View style={[styles.loginSeparator, { backgroundColor: theme.primary }]} />
        <TextInput
          style={[styles.inputLogin, { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text }]}
          placeholder="Nombre de sucursal"
          placeholderTextColor={theme.textMuted}
          value={inputSucursal}
          onChangeText={setInputSucursal}
          autoCapitalize="words"
        />
        <TouchableOpacity style={[styles.btnLogin, { backgroundColor: theme.primary }]} onPress={loginSucursal} activeOpacity={0.85}>
          <Text style={[styles.btnLoginText, { color: theme.badgeText }]}>INGRESAR</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.loginFooter, { color: theme.textMuted }]}>Scanner R21 v1.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loginContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  loginCard: { width: '100%', borderRadius: 28, padding: 35, alignItems: 'center', borderWidth: 1, elevation: 20, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24 },
  loginIcono: { fontSize: 42, fontWeight: 'bold', letterSpacing: 8, marginBottom: 8 },
  loginTitulo: { fontSize: 30, fontWeight: 'bold', marginBottom: 4 },
  loginSubtitulo: { fontSize: 14, marginBottom: 28, letterSpacing: 1 },
  loginSeparator: { width: 60, height: 4, borderRadius: 2, marginBottom: 32 },
  inputLogin: { borderWidth: 1, padding: 16, borderRadius: 16, marginBottom: 20, width: '100%', fontSize: 16 },
  btnLogin: { padding: 18, borderRadius: 16, alignItems: 'center', width: '100%', elevation: 8, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
  btnLoginText: { fontWeight: 'bold', fontSize: 17, letterSpacing: 2 },
  loginFooter: { fontSize: 12, marginTop: 30 },
});
