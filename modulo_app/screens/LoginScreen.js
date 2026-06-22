import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert, StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { guardarSucursal } from '../utils/storage';

const SUCURSALES_PERMITIDAS = ["Minimarket LF", "Local 1"];

export default function LoginScreen({ onLogin }) {
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

const styles = StyleSheet.create({
  loginContainer: {
    flex: 1, backgroundColor: '#0D1B2A', justifyContent: 'center', alignItems: 'center', padding: 30,
  },
  loginCard: {
    backgroundColor: '#1B2838', width: '100%', borderRadius: 28, padding: 35,
    alignItems: 'center', borderWidth: 1, borderColor: '#2A3F4F',
    elevation: 20, shadowColor: '#00BCD4', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 24,
  },
  loginIcono: { fontSize: 42, fontWeight: 'bold', color: '#00BCD4', letterSpacing: 8, marginBottom: 8 },
  loginTitulo: { fontSize: 30, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  loginSubtitulo: { fontSize: 14, color: '#78909C', marginBottom: 28, letterSpacing: 1 },
  loginSeparator: { width: 60, height: 4, backgroundColor: '#00BCD4', borderRadius: 2, marginBottom: 32 },
  inputLogin: {
    borderWidth: 1, borderColor: '#2A3F4F', padding: 16, borderRadius: 16,
    marginBottom: 20, width: '100%', backgroundColor: '#0D1B2A', color: '#FFFFFF', fontSize: 16,
  },
  btnLogin: {
    backgroundColor: '#00BCD4', padding: 18, borderRadius: 16, alignItems: 'center', width: '100%',
    elevation: 8, shadowColor: '#00BCD4', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12,
  },
  btnLoginText: { color: '#0D1B2A', fontWeight: 'bold', fontSize: 17, letterSpacing: 2 },
  loginFooter: { color: '#546E7A', fontSize: 12, marginTop: 30 },
});
