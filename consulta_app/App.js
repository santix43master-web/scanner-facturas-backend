import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet, StatusBar, Modal, ScrollView, Alert, Animated, Vibration, KeyboardAvoidingView, Platform,
} from "react-native";
import { CameraView, Camera } from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY_URL = "@consulta_api_url";
const DEFAULT_URL = "https://snooze-chafe-bullwhip.ngrok-free.dev";
const SB_H = StatusBar.currentHeight || 24;

const FMT = (n) => {
  if (n == null || n === "") return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "—";
  return Number.isInteger(num) ? num.toLocaleString("de-DE") : parseFloat(num.toFixed(2)).toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const FMT_PCT = (n) => {
  if (n == null || n === "") return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "—";
  return Number.isInteger(num) ? String(num) : parseFloat(num.toFixed(2)).toString();
};

const api = async (path, opts = {}) => {
  const stored = await AsyncStorage.getItem(STORAGE_KEY_URL);
  const base = stored || DEFAULT_URL;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(`${base}${path}`, {
      headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      ...opts,
      signal: controller.signal,
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Error de conexión");
    return j;
  } finally {
    clearTimeout(t);
  }
};

const FD = (d) => d ? d.split("T")[0] : "";
const ESTADOS = ["Heladera", "Depósito", "Estante Salón", "Estantes Caja"];

function CModal({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={cm.overlay}>
        <View style={cm.box}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always" nestedScrollEnabled>
            <Text style={cm.title}>{title}</Text>
            {children}
          </ScrollView>
          {onClose && <TouchableOpacity style={cm.closeBtn} onPress={onClose}><Text style={cm.closeText}>Cerrar</Text></TouchableOpacity>}
        </View>
      </View>
    </Modal>
  );
}

const cm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  box: { backgroundColor: "#fff", borderRadius: 20, padding: 24, maxHeight: "85%", elevation: 10 },
  title: { fontSize: 20, fontWeight: "700", color: "#1a1a2e", marginBottom: 16, textAlign: "center" },
  closeBtn: { marginTop: 16, backgroundColor: "#eee", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  closeText: { fontSize: 15, fontWeight: "600", color: "#555" },
});

function LoginScreen({ onLogin }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const doLogin = async () => {
    if (!user.trim() || !pass.trim()) return;
    setLoading(true); setError("");
    try {
      const d = await api("/login", { method: "POST", body: JSON.stringify({ usuario: user.trim(), contrasena: pass.trim() }) });
      if (d.error) { setError(d.error); return; }
      onLogin(d.user);
    } catch { setError("Error de conexión"); }
    setLoading(false);
  };
  return (
    <KeyboardAvoidingView style={ls.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={ls.top}>
          <View style={ls.logoCircle}><Text style={ls.logoText}>CB</Text></View>
          <Text style={ls.title}>Consulta Bienes</Text>
          <Text style={ls.sub}>Iniciar sesión</Text>
        </View>
        <View style={ls.form}>
          <TextInput style={ls.input} placeholder="Usuario" placeholderTextColor="#999" value={user} onChangeText={setUser} autoCapitalize="none" autoCorrect={false} />
          <TextInput style={ls.input} placeholder="Contraseña" placeholderTextColor="#999" value={pass} onChangeText={setPass} secureTextEntry onSubmitEditing={doLogin} />
          {error ? <Text style={ls.error}>{error}</Text> : null}
          <TouchableOpacity style={[ls.btn, loading && { opacity: 0.6 }]} onPress={doLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={ls.btnText}>Ingresar</Text>}
          </TouchableOpacity>
        </View>
        <View style={ls.footer}><Text style={ls.footerText}>app-facturas v1.0</Text></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const ls = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a2e" },
  top: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  logoCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#0f3460", justifyContent: "center", alignItems: "center", marginBottom: 16, borderWidth: 3, borderColor: "#e94560" },
  logoText: { fontSize: 28, fontWeight: "800", color: "#fff" },
  title: { fontSize: 26, fontWeight: "800", color: "#fff", marginBottom: 6 },
  sub: { fontSize: 14, color: "rgba(255,255,255,0.6)" },
  form: { paddingHorizontal: 32, paddingBottom: 40 },
  input: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, padding: 16, fontSize: 16, color: "#fff", marginBottom: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  btn: { backgroundColor: "#e94560", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  btnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  error: { color: "#ff6b6b", fontSize: 14, marginBottom: 8, textAlign: "center" },
  footer: { paddingVertical: 20, alignItems: "center" },
  footerText: { color: "rgba(255,255,255,0.3)", fontSize: 12 },
});

// ── Bienes ─────────────────────────────────────────────
function BienesScreen({ user }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({});
  const [addLoading, setAddLoading] = useState(false);
  const [calcModal, setCalcModal] = useState(false);
  const [calcForm, setCalcForm] = useState({ costo: "", margen: "" });
  const [addCalcModal, setAddCalcModal] = useState(false);
  const [addCalcForm, setAddCalcForm] = useState({ costo: "", margen: "" });
  const [addCalcMayModal, setAddCalcMayModal] = useState(false);
  const [addCalcMayForm, setAddCalcMayForm] = useState({ costo: "", margen: "" });
  const [createErr, setCreateErr] = useState("");
  const [grupos, setGrupos] = useState([]);
  const [grupoBusqueda, setGrupoBusqueda] = useState("");
  const [scanner, setScanner] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const scanned = useRef(false);

  const load = useCallback(async (query) => {
    setLoading(true);
    const d = await api(`/bien-servicio?activo=S${query ? `&q=${encodeURIComponent(query)}` : ""}`);
    setItems(d.items || []);
    setLoading(false);
    setRefreshing(false);
  }, []);

  const onRefresh = useCallback(() => { setRefreshing(true); load(q); }, [load, q]);

  useEffect(() => { load(""); }, [load]);

  const openEdit = (item) => {
    const cln = (v) => v != null && v !== "" ? String(parseFloat(v)) : "";
    setForm({
      desc_bien_servicio: (item.desc_bien_servicio || "").trim(),
      precio_costo: cln(item.precio_costo),
      precio_venta: cln(item.precio_venta),
      precio_mayorista: cln(item.precio_mayorista),
      mayorista_desde: cln(item.mayorista_desde),
      calc_porc: cln(item.calc_porc),
      codigo_barra: item.codigo_barra || "",
      codigo_operativo: item.codigo_operativo || "",
      cant_existencia: cln(item.cant_existencia),
      existencia_minima: cln(item.existencia_minima),
    });
    setEditItem(item);
  };

  const calcMargen = (costo, margen) => {
    if (!costo || !margen) return "";
    const c = parseFloat(costo); const m = parseFloat(margen);
    if (isNaN(c) || isNaN(m)) return "";
    return String(Math.round(c * (1 + m / 100)));
  };

  const saveEdit = async () => {
    if (!editItem) return;
    const body = {};
    const f = (k) => {
      if (k === "desc_bien_servicio") { if (form[k] !== (editItem[k] || "").trim()) body[k] = form[k]; return; }
      if (k === "codigo_barra" || k === "codigo_operativo") { if (form[k] !== (editItem[k] || "")) body[k] = form[k] || null; return; }
      if (form[k] !== String(editItem[k] ?? "")) body[k] = parseFloat(form[k]) || 0;
    };
    ["desc_bien_servicio", "precio_costo", "precio_venta", "precio_mayorista", "mayorista_desde", "calc_porc", "codigo_barra", "codigo_operativo", "cant_existencia", "existencia_minima"].forEach(f);
    if (Object.keys(body).length === 0) { setEditItem(null); return; }
    try {
      await api(`/bien-servicio/${editItem.cod_grupo_bien_servicio}/${editItem.cod_bien_servicio}`, { method: "PUT", body: JSON.stringify(body) });
      setEditItem(null);
      load(q);
    } catch (e) {
      setCreateErr(e.message);
    }
  };

  const createItem = async () => {
    if (!addForm.desc_bien_servicio?.trim()) return;
    setAddLoading(true);
    try {
      await api("/bien-servicio", { method: "POST", body: JSON.stringify({ ...addForm, precio_costo: parseFloat(addForm.precio_costo) || 0, precio_venta: parseFloat(addForm.precio_venta) || 0, precio_mayorista: parseFloat(addForm.precio_mayorista) || 0, mayorista_desde: parseFloat(addForm.mayorista_desde) || 0, calc_porc: parseFloat(addForm.calc_porc) || 0, cant_existencia: parseFloat(addForm.cant_existencia) || 0, existencia_minima: parseFloat(addForm.existencia_minima) || 0, cod_usuario: user?.cod_usuario }) });
      setAddLoading(false); setShowAdd(false); setAddForm({}); load("");
    } catch (e) {
      setAddLoading(false);
      setCreateErr(e.message);
    }
  };

  const applyCalc = () => {
    const pv = calcMargen(calcForm.costo, calcForm.margen);
    if (pv) setForm(f => ({ ...f, precio_costo: calcForm.costo, precio_venta: pv, calc_porc: calcForm.margen }));
    setCalcModal(false);
  };

  const addApplyCalc = () => {
    const pv = calcMargen(addCalcForm.costo, addCalcForm.margen);
    if (pv) setAddForm(f => ({ ...f, precio_costo: addCalcForm.costo, precio_venta: pv, calc_porc: addCalcForm.margen }));
    setAddCalcModal(false);
  };

  const addApplyCalcMay = () => {
    const pv = calcMargen(addCalcMayForm.costo, addCalcMayForm.margen);
    if (pv) setAddForm(f => ({ ...f, precio_mayorista: pv }));
    setAddCalcMayModal(false);
  };

  const inpRow = (key, label, kb = "default") => (
    <View style={fr.row}><Text style={fr.label}>{label}</Text><TextInput style={fr.input} value={form[key]} onChangeText={(v) => setForm({ ...form, [key]: v })} keyboardType={kb} /></View>
  );
  const addRow = (key, label, kb = "default") => (
    <View style={fr.row}><Text style={fr.label}>{label}</Text><TextInput style={fr.input} value={addForm[key] || ""} onChangeText={(v) => setAddForm({ ...addForm, [key]: v })} keyboardType={kb} /></View>
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={s.header}><Text style={s.title}>📦 Bienes</Text><Text style={s.count}>{items.length} items</Text></View>
      <View style={s.sr}>
        <TextInput style={s.inp} placeholder="Buscar..." value={q} onChangeText={setQ} onSubmitEditing={() => load(q)} returnKeyType="search" />
        <TouchableOpacity style={s.btn} onPress={() => load(q)}><Text style={s.btnT}>🔍</Text></TouchableOpacity>
        <TouchableOpacity style={[s.btn, { backgroundColor: "#1a1a2e" }]} onPress={async () => { const c = await Camera.requestCameraPermissionsAsync(); if (!c.granted) return; MediaLibrary.requestPermissionsAsync(); scanned.current = false; setScanner(true); }}><Text style={s.btnT}>📷</Text></TouchableOpacity>
        <TouchableOpacity style={[s.btn, { backgroundColor: "#0f3460" }]} onPress={async () => { const d = await api("/grupos"); setGrupos(d || []); setAddForm({ cod_grupo_bien_servicio: d[0]?.cod_grupo_bien_servicio }); setShowAdd(true); }}><Text style={s.btnT}>+</Text></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator size="large" color="#e94560" style={{ marginTop: 30 }} /> : (
        <FlatList data={items} keyExtractor={(i) => `${i.cod_grupo_bien_servicio}-${i.cod_bien_servicio}`}
          refreshing={refreshing} onRefresh={onRefresh}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} onPress={() => openEdit(item)}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Text style={s.cn} numberOfLines={2}>{item.desc_bien_servicio?.trim()}</Text>
                <View style={{ backgroundColor: "#0f3460", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{item.calc_porc ? `${FMT_PCT(item.calc_porc)}%` : "—"}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 11, color: "#999", marginBottom: 10 }}>📦 {item.desc_grupo_bien_servicio || "—"}</Text>
              <View style={{ flexDirection: "row", gap: 16 }}>
                <View>
                  <Text style={{ fontSize: 10, color: "#999", textTransform: "uppercase" }}>Venta</Text>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: "#e94560" }}>Gs {FMT(item.precio_venta)}</Text>
                </View>
                {item.precio_mayorista ? (
                  <View>
                    <Text style={{ fontSize: 10, color: "#999", textTransform: "uppercase" }}>Venta Mayorista</Text>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#0f3460" }}>Gs {FMT(item.precio_mayorista)}</Text>
                    {item.mayorista_desde ? <Text style={{ fontSize: 10, color: "#aaa" }}>desde {item.mayorista_desde} u.</Text> : null}
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#f0f0f0" }}>
                <Text style={{ fontSize: 11, color: "#aaa" }}>🔢 {item.codigo_barra ? `Código: ${item.codigo_barra}` : `#${item.cod_bien_servicio}`}</Text>
                {item.codigo_operativo ? <Text style={{ fontSize: 11, color: "#aaa", marginLeft: 12 }}>⚙️ {item.codigo_operativo}</Text> : null}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={s.emp}>Sin resultados</Text>}
        />
      )}

      <Modal visible={!!editItem} transparent animationType="slide">
        <View style={eo.overlay}><TouchableOpacity style={eo.topClose} onPress={() => setEditItem(null)} />
          <View style={eo.box}><ScrollView>
            <Text style={eo.title}>Editar</Text>
            <Text style={eo.subtitle}>{editItem?.desc_bien_servicio?.trim()}</Text>
            {inpRow("desc_bien_servicio", "Descripción")}
            <View style={fr.row}><Text style={fr.label}>Precio Costo</Text><View style={{ flex: 1, flexDirection: "row", gap: 6 }}>
              <TextInput style={[fr.input, { flex: 1 }]} value={form.precio_costo} onChangeText={(v) => setForm({ ...form, precio_costo: v })} keyboardType="decimal" />
              <TouchableOpacity style={eo.calcBtn} onPress={() => { setCalcForm({ costo: form.precio_costo, margen: form.calc_porc }); setCalcModal(true); }}><Text style={eo.calcText}>%</Text></TouchableOpacity>
            </View></View>
            {inpRow("precio_venta", "Precio Venta", "decimal")}
            {inpRow("precio_mayorista", "Precio Mayorista", "decimal")}
            {inpRow("mayorista_desde", "Mayorista desde (uds)", "decimal")}
            {inpRow("calc_porc", "Margen %", "decimal")}
            {inpRow("codigo_barra", "Código Barras")}
            {inpRow("codigo_operativo", "Código Operativo")}
            {inpRow("cant_existencia", "Stock", "decimal")}
            {inpRow("existencia_minima", "Stock Mínimo", "decimal")}
          </ScrollView>
          <TouchableOpacity style={eo.saveBtn} onPress={saveEdit}><Text style={eo.saveText}>Guardar</Text></TouchableOpacity></View>
        </View>
      </Modal>

      <CModal visible={calcModal} onClose={() => setCalcModal(false)} title="Calcular Margen">
        <View style={fr.row}><Text style={fr.label}>Costo</Text><TextInput style={fr.input} value={calcForm.costo} onChangeText={(v) => setCalcForm({ ...calcForm, costo: v })} keyboardType="decimal" /></View>
        <View style={fr.row}><Text style={fr.label}>Margen %</Text><TextInput style={fr.input} value={calcForm.margen} onChangeText={(v) => setCalcForm({ ...calcForm, margen: v })} keyboardType="decimal" /></View>
        <Text style={{ fontSize: 14, color: "#666", marginVertical: 8 }}>Precio venta sugerido: <Text style={{ fontWeight: "700", color: "#e94560", fontSize: 18 }}>Gs {FMT(calcMargen(calcForm.costo, calcForm.margen))}</Text></Text>
        <TouchableOpacity style={[s.btn, { paddingVertical: 14, marginTop: 8 }]} onPress={applyCalc}><Text style={[s.btnT, { textAlign: "center" }]}>Aplicar</Text></TouchableOpacity>
      </CModal>

      <CModal visible={addCalcModal} onClose={() => setAddCalcModal(false)} title="Calcular Margen">
        <View style={fr.row}><Text style={fr.label}>Costo</Text><TextInput style={fr.input} value={addCalcForm.costo} onChangeText={(v) => setAddCalcForm({ ...addCalcForm, costo: v })} keyboardType="decimal" /></View>
        <View style={fr.row}><Text style={fr.label}>Margen %</Text><TextInput style={fr.input} value={addCalcForm.margen} onChangeText={(v) => setAddCalcForm({ ...addCalcForm, margen: v })} keyboardType="decimal" /></View>
        <Text style={{ fontSize: 14, color: "#666", marginVertical: 8 }}>Precio venta sugerido: <Text style={{ fontWeight: "700", color: "#e94560", fontSize: 18 }}>Gs {FMT(calcMargen(addCalcForm.costo, addCalcForm.margen))}</Text></Text>
        <TouchableOpacity style={[s.btn, { paddingVertical: 14, marginTop: 8 }]} onPress={addApplyCalc}><Text style={[s.btnT, { textAlign: "center" }]}>Aplicar</Text></TouchableOpacity>
      </CModal>

      <CModal visible={addCalcMayModal} onClose={() => setAddCalcMayModal(false)} title="Calcular Mayorista">
        <View style={fr.row}><Text style={fr.label}>Costo</Text><TextInput style={fr.input} value={addCalcMayForm.costo} onChangeText={(v) => setAddCalcMayForm({ ...addCalcMayForm, costo: v })} keyboardType="decimal" /></View>
        <View style={fr.row}><Text style={fr.label}>Margen %</Text><TextInput style={fr.input} value={addCalcMayForm.margen} onChangeText={(v) => setAddCalcMayForm({ ...addCalcMayForm, margen: v })} keyboardType="decimal" /></View>
        <Text style={{ fontSize: 14, color: "#666", marginVertical: 8 }}>Precio mayorista sugerido: <Text style={{ fontWeight: "700", color: "#0f3460", fontSize: 18 }}>Gs {FMT(calcMargen(addCalcMayForm.costo, addCalcMayForm.margen))}</Text></Text>
        <TouchableOpacity style={[s.btn, { paddingVertical: 14, marginTop: 8 }]} onPress={addApplyCalcMay}><Text style={[s.btnT, { textAlign: "center" }]}>Aplicar</Text></TouchableOpacity>
      </CModal>

      <CModal visible={showAdd} onClose={() => setShowAdd(false)} title="Nuevo Artículo">
        {addRow("desc_bien_servicio", "Descripción")}
        <View style={fr.row}><Text style={fr.label}>Grupo</Text>
          <TextInput style={[fr.input, { marginBottom: 8 }]} placeholder="Buscar grupo..." value={grupoBusqueda} onChangeText={setGrupoBusqueda} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: "row" }}>
            {grupos.filter(g => !grupoBusqueda || g.desc_grupo_bien_servicio?.toLowerCase().includes(grupoBusqueda.toLowerCase())).map((g) => (
              <TouchableOpacity key={g.cod_grupo_bien_servicio} style={[gp.chip, addForm.cod_grupo_bien_servicio === g.cod_grupo_bien_servicio && gp.chipActive]}
                onPress={() => { setAddForm({ ...addForm, cod_grupo_bien_servicio: g.cod_grupo_bien_servicio }); setGrupoBusqueda(""); }}>
                <Text style={[gp.chipText, addForm.cod_grupo_bien_servicio === g.cod_grupo_bien_servicio && gp.chipTextActive]}>{g.desc_grupo_bien_servicio?.trim()}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        {addRow("codigo_barra", "Código Barras")}
        <View style={fr.row}><Text style={fr.label}>Precio Costo</Text><View style={{ flex: 1, flexDirection: "row", gap: 6 }}>
          <TextInput style={[fr.input, { flex: 1 }]} value={addForm.precio_costo} onChangeText={(v) => setAddForm({ ...addForm, precio_costo: v })} keyboardType="decimal" />
          <TouchableOpacity style={eo.calcBtn} onPress={() => { setAddCalcForm({ costo: addForm.precio_costo, margen: addForm.calc_porc }); setAddCalcModal(true); }}><Text style={eo.calcText}>%</Text></TouchableOpacity>
        </View></View>
        {addRow("precio_venta", "Precio Venta", "decimal")}
        <View style={fr.row}><Text style={fr.label}>Precio Mayorista</Text><View style={{ flex: 1, flexDirection: "row", gap: 6 }}>
          <TextInput style={[fr.input, { flex: 1 }]} value={addForm.precio_mayorista} onChangeText={(v) => setAddForm({ ...addForm, precio_mayorista: v })} keyboardType="decimal" />
          <TouchableOpacity style={eo.calcBtn} onPress={() => { setAddCalcMayForm({ costo: addForm.precio_costo, margen: addForm.calc_porc }); setAddCalcMayModal(true); }}><Text style={eo.calcText}>%</Text></TouchableOpacity>
        </View></View>
        {addRow("mayorista_desde", "Mayorista desde (uds)", "decimal")}
        {addRow("calc_porc", "Margen %", "decimal")}
        {addRow("cant_existencia", "Stock", "decimal")}
        {addRow("existencia_minima", "Stock Mínimo", "decimal")}
        <TouchableOpacity style={[s.btn, { paddingVertical: 14, marginTop: 8, opacity: addLoading ? 0.6 : 1 }]} onPress={createItem} disabled={addLoading}>
          {addLoading ? <ActivityIndicator color="#fff" /> : <Text style={[s.btnT, { textAlign: "center" }]}>Crear Artículo</Text>}
        </TouchableOpacity>
      </CModal>

      <CModal visible={!!createErr} onClose={() => setCreateErr("")} title="Error">
        <Text style={{ fontSize: 15, color: "#e94560", textAlign: "center", marginVertical: 16, lineHeight: 22 }}>{createErr}</Text>
      </CModal>

      {scanner && (
        <View style={StyleSheet.absoluteFill}>
          <CameraView style={StyleSheet.absoluteFill} facing="back"
            onBarcodeScanned={scanned.current ? undefined : (r) => {
              scanned.current = true;
              Vibration.vibrate(50);
              setScanner(false);
              setQ(r.data);
              load(r.data);
            }}
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "code128", "upc_a"] }}
          >
            <View style={s.scanOverlay}>
              <Text style={s.scanText}>Escaneá el código de barras</Text>
              <View style={s.scanFrame} />
              <TouchableOpacity style={s.scanCancel} onPress={() => setScanner(false)}><Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>Cancelar</Text></TouchableOpacity>
            </View>
          </CameraView>
        </View>
      )}
    </View>
  );
}

const fr = StyleSheet.create({
  row: { marginBottom: 12 }, label: { fontSize: 13, color: "#555", marginBottom: 4, fontWeight: "500" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: "#fafafa", color: "#000" },
});

const eo = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }, topClose: { flex: 1 },
  box: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "85%" },
  title: { fontSize: 20, fontWeight: "700", color: "#1a1a2e" }, subtitle: { fontSize: 14, color: "#666", marginBottom: 16 },
  calcBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: "#0f3460", justifyContent: "center", alignItems: "center" },
  calcText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  saveBtn: { backgroundColor: "#e94560", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 12 },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});

const gp = StyleSheet.create({
  chip: { backgroundColor: "#f0f0f0", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, marginBottom: 8 },
  chipActive: { backgroundColor: "#0f3460" }, chipText: { fontSize: 13, color: "#555", fontWeight: "500" },
  chipTextActive: { color: "#fff" },
});

// ── Vencimientos ───────────────────────────────────────
function VencimientosScreen({ user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({});
  const [addLoading, setAddLoading] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [scanner, setScanner] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [vencErr, setVencErr] = useState("");
  const [historial, setHistorial] = useState([]);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const scannedRef = useRef(false);
  const formRef = useRef(addForm);
  useEffect(() => { formRef.current = addForm; }, [addForm]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api("/vencimientos");
      setItems(d.items || []);
    } catch (e) {
      setVencErr(e.message);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  const loadHistorial = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api("/vencimientos/historial");
      setHistorial(d.items || []);
    } catch (e) {
      setVencErr(e.message);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  const onRefresh = useCallback(() => { setRefreshing(true); if (mostrarHistorial) loadHistorial(); else load(); }, [load, loadHistorial, mostrarHistorial]);

  useEffect(() => { if (mostrarHistorial) loadHistorial(); else load(); }, [load, loadHistorial, mostrarHistorial]);

  const buscarProd = async (q) => {
    if (!q.trim()) { setResultados([]); return; }
    setBuscando(true);
    try {
      const d = await api(`/bien-servicio?activo=S&q=${encodeURIComponent(q)}`);
      setResultados(d.items || []);
    } catch (e) {
      setVencErr(e.message);
    }
    setBuscando(false);
  };

  const hoy = () => { const d = new Date(); return { d: String(d.getDate()).padStart(2, "0"), m: String(d.getMonth() + 1).padStart(2, "0"), y: String(d.getFullYear()) }; };

  const seleccionarProd = (p) => {
    const { d, m, y } = hoy();
    setAddForm({ ...addForm, cod_grupo_bien_servicio: p.cod_grupo_bien_servicio, cod_bien_servicio: p.cod_bien_servicio, prodLabel: `${p.desc_bien_servicio?.trim()} ${p.codigo_barra ? `(${p.codigo_barra})` : ""}`, vtoD: d, vtoM: m, vtoY: y, estado: addForm.estado || "" });
    setBusqueda("");
    setResultados([]);
  };

  const crearVenc = async () => {
    const f = formRef.current;
    if (!f.cod_grupo_bien_servicio) { setVencErr("Seleccioná un producto"); return; }
    if (!f.vtoY || !f.vtoM || !f.vtoD) { setVencErr("Completá la fecha de vencimiento"); return; }
    const fecha_vto = `${f.vtoY}-${f.vtoM}-${f.vtoD}`;
    setAddLoading(true);
    try {
      await api("/vencimientos", { method: "POST", body: JSON.stringify({ cod_grupo_bien_servicio: f.cod_grupo_bien_servicio, cod_bien_servicio: f.cod_bien_servicio, fecha_vto, cod_usuario: user?.cod_usuario, estado: f.estado || null }) });
      setAddLoading(false); setShowAdd(false); setAddForm({}); setBusqueda(""); setResultados([]); load();
    } catch (e) {
      setAddLoading(false);
      setVencErr(e.message);
    }
  };

  const inactivar = async (item) => {
    try {
      await api("/vencimientos/inactivar", { method: "POST", body: JSON.stringify({ cod_grupo_bien_servicio: item.cod_grupo_bien_servicio, cod_bien_servicio: item.cod_bien_servicio, nro_item: item.nro_item }) });
      load();
    } catch (e) {
      setVencErr(e.message);
    }
  };

  const diasRest = (f) => Math.ceil((new Date(f) - new Date()) / (1000 * 60 * 60 * 24));

  return (
    <View style={{ flex: 1 }}>
      <View style={s.header}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={s.title}>⏰ Vencimientos</Text>
          {!mostrarHistorial && (
            <TouchableOpacity style={{ backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }} onPress={() => { const { d, m, y } = hoy(); setAddForm({ vtoD: d, vtoM: m, vtoY: y, estado: "" }); setBusqueda(""); setResultados([]); setShowAdd(true); }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>+</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <TouchableOpacity style={[gp.chip, !mostrarHistorial && gp.chipActive]} onPress={() => { if (mostrarHistorial) { setMostrarHistorial(false); } }}>
            <Text style={[gp.chipText, !mostrarHistorial && gp.chipTextActive]}>Pendientes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[gp.chip, mostrarHistorial && gp.chipActive]} onPress={() => { if (!mostrarHistorial) { setMostrarHistorial(true); } }}>
            <Text style={[gp.chipText, mostrarHistorial && gp.chipTextActive]}>Revisados</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.count}>{mostrarHistorial ? historial.length : items.length} registros</Text>
      </View>
      {loading ? <ActivityIndicator size="large" color="#e94560" style={{ marginTop: 30 }} /> : !mostrarHistorial ? (
        <FlatList data={items} keyExtractor={(i, idx) => `${i.cod_grupo_bien_servicio}-${i.cod_bien_servicio}-${i.nro_item}-${idx}`}
          refreshing={refreshing} onRefresh={onRefresh}
          renderItem={({ item }) => {
            const diff = diasRest(item.fecha_vto);
            const urgente = diff >= 0 && diff <= 7;
            const vencido = diff < 0;
            return (
              <View style={[vc.card, urgente && vc.cardUrgent, vencido && vc.cardExpired]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[vc.name, (urgente || vencido) && { color: "#fff" }]} numberOfLines={2}>{item.desc_bien_servicio?.trim()}</Text>
                    <Text style={[vc.lote, (urgente || vencido) && { color: "rgba(255,255,255,0.7)" }]}>Lote: {item.nro_item}{item.estado ? ` · ${item.estado}` : ""}</Text>
                  </View>
                  {!item.revisado && <View style={vc.dot} />}
                </View>
                <View style={vc.row}>
                  <Text style={[vc.date, (urgente || vencido) && { color: "#fff" }]}>Vence: {FD(item.fecha_vto)}</Text>
                  {vencido ? <Text style={vc.badgeExpired}>VENCIDO</Text> : urgente ? <Text style={vc.badgeUrgent}>{diff} días</Text> : <Text style={vc.badgeOk}>{diff} días</Text>}
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  {vencido && (
                    <TouchableOpacity style={vc.inacBtn} onPress={() => inactivar(item)}>
                      <Text style={vc.inacText}>Inactivar</Text>
                    </TouchableOpacity>
                  )}
                  {urgente && !vencido && (
                    <TouchableOpacity style={vc.revBtn} onPress={async () => { try { await api("/vencimientos/revisar", { method: "POST", body: JSON.stringify({ cod_grupo_bien_servicio: item.cod_grupo_bien_servicio, cod_bien_servicio: item.cod_bien_servicio, nro_item: item.nro_item, fecha_vto: item.fecha_vto, cod_usuario: user?.cod_usuario }) }); await load(); } catch (e) { setVencErr(e.message); } }}>
                      <Text style={vc.revText}>✓ Revisado</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={s.emp}>Sin vencimientos</Text>}
        />
      ) : (
        <FlatList data={historial} keyExtractor={(_, idx) => String(idx)}
          refreshing={refreshing} onRefresh={onRefresh}
          renderItem={({ item }) => (
            <View style={vc.card}>
              <Text style={vc.name} numberOfLines={2}>{item.desc_bien_servicio?.trim()}</Text>
              <Text style={vc.lote}>Lote: {item.nro_item}</Text>
              <View style={vc.row}>
                <Text style={vc.date}>Anterior: {FD(item.fecha_anterior)}</Text>
                <Text style={[vc.date, { fontWeight: "700", color: "#2e7d32" }]}>Nueva: {FD(item.fecha_nueva)}</Text>
              </View>
              <Text style={{ fontSize: 11, color: "#999", marginTop: 4 }}>{item.created_at ? item.created_at.split(".")[0].replace("T", " ") : ""}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={s.emp}>Sin revisiones</Text>}
        />
      )}

      <CModal visible={showAdd} onClose={() => { setShowAdd(false); setBusqueda(""); setResultados([]); }} title="Nuevo Vencimiento">
        <View style={fr.row}>
          <Text style={fr.label}>Producto</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TextInput style={[fr.input, { flex: 1 }]} placeholder="Buscar producto..." value={busqueda} onChangeText={(v) => { setBusqueda(v); buscarProd(v); }} />
            <TouchableOpacity style={[s.btn, { paddingHorizontal: 12 }]} onPress={async () => { const c = await Camera.requestCameraPermissionsAsync(); if (!c.granted) return; MediaLibrary.requestPermissionsAsync(); scannedRef.current = false; setShowAdd(false); setScanner(true); }}><Text style={s.btnT}>📷</Text></TouchableOpacity>
          </View>
        </View>
        {buscando ? <ActivityIndicator size="small" color="#e94560" /> : resultados.length > 0 && (
          <FlatList data={resultados} keyExtractor={(i) => `${i.cod_grupo_bien_servicio}-${i.cod_bien_servicio}`} style={{ maxHeight: 180 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={vc.prodItem} onPress={() => seleccionarProd(item)}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#1a1a2e" }}>{item.desc_bien_servicio?.trim()}</Text>
                <Text style={{ fontSize: 11, color: "#999" }}>{item.codigo_barra || `#${item.cod_bien_servicio}`} · {item.desc_grupo_bien_servicio}</Text>
              </TouchableOpacity>
            )}
          />
        )}
        {addForm.prodLabel ? (
          <View style={vc.selProd}><Text style={{ fontSize: 14, color: "#1a1a2e", fontWeight: "500" }}>{addForm.prodLabel}</Text></View>
        ) : null}
        <View style={fr.row}><Text style={fr.label}>Estado / Ubicación</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {ESTADOS.map((e) => (
              <TouchableOpacity key={e} style={[gp.chip, addForm.estado === e && gp.chipActive]}
                onPress={() => setAddForm({ ...addForm, estado: addForm.estado === e ? "" : e })}>
                <Text style={[gp.chipText, addForm.estado === e && gp.chipTextActive]}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={fr.row}><Text style={fr.label}>Fecha vto</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <View style={{ flex: 1 }}><TextInput style={[fr.input, { textAlign: "center" }]} value={addForm.vtoD} onChangeText={(v) => setAddForm({ ...addForm, vtoD: v })} keyboardType="number" maxLength={2} placeholder="Día" /></View>
            <View style={{ flex: 1 }}><TextInput style={[fr.input, { textAlign: "center" }]} value={addForm.vtoM} onChangeText={(v) => setAddForm({ ...addForm, vtoM: v })} keyboardType="number" maxLength={2} placeholder="Mes" /></View>
            <View style={{ flex: 1.5 }}><TextInput style={[fr.input, { textAlign: "center" }]} value={addForm.vtoY} onChangeText={(v) => setAddForm({ ...addForm, vtoY: v })} keyboardType="number" maxLength={4} placeholder="Año" /></View>
          </View>
        </View>
        <TouchableOpacity style={[s.btn, { paddingVertical: 14, marginTop: 8, opacity: addLoading ? 0.6 : 1 }]} onPress={crearVenc} disabled={addLoading}>
          {addLoading ? <ActivityIndicator color="#fff" /> : <Text style={[s.btnT, { textAlign: "center" }]}>Guardar</Text>}
        </TouchableOpacity>
      </CModal>

      <CModal visible={!!vencErr} onClose={() => setVencErr("")} title="Error">
        <Text style={{ fontSize: 15, color: "#e94560", textAlign: "center", marginVertical: 16, lineHeight: 22 }}>{vencErr}</Text>
      </CModal>

      {scanner && (
        <View style={StyleSheet.absoluteFill}>
          <CameraView style={StyleSheet.absoluteFill} facing="back"
            onBarcodeScanned={scannedRef.current ? undefined : (r) => {
              scannedRef.current = true;
              Vibration.vibrate(50);
              setScanner(false);
              setBusqueda(r.data);
              buscarProd(r.data);
              setShowAdd(true);
            }}
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "code128", "upc_a"] }}
          >
            <View style={s.scanOverlay}>
              <Text style={s.scanText}>Escaneá el código de barras</Text>
              <View style={s.scanFrame} />
              <TouchableOpacity style={s.scanCancel} onPress={() => { setScanner(false); setShowAdd(true); }}><Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>Cancelar</Text></TouchableOpacity>
            </View>
          </CameraView>
        </View>
      )}
    </View>
  );
}

const vc = StyleSheet.create({
  card: { backgroundColor: "#fff", marginHorizontal: 10, marginVertical: 5, borderRadius: 14, padding: 16, elevation: 3 },
  cardUrgent: { backgroundColor: "#e94560" }, cardExpired: { backgroundColor: "#333" },
  name: { fontSize: 15, fontWeight: "600", color: "#1a1a2e" }, lote: { fontSize: 12, color: "#999", marginTop: 2 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  date: { fontSize: 13, color: "#666" }, dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#e94560" },
  badgeOk: { fontSize: 12, fontWeight: "600", color: "#2e7d32", backgroundColor: "#e8f5e9", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  badgeUrgent: { fontSize: 12, fontWeight: "600", color: "#fff", backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  badgeExpired: { fontSize: 12, fontWeight: "600", color: "#fff", backgroundColor: "#c62828", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  revBtn: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14 },
  revText: { fontSize: 13, fontWeight: "600", color: "#fff" },
  inacBtn: { backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14 },
  inacText: { fontSize: 13, fontWeight: "600", color: "#fff" },
  prodItem: { borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 10 },
  selProd: { backgroundColor: "#e8f5e9", borderRadius: 10, padding: 12, marginBottom: 12 },
});

// ── Configuración ──────────────────────────────────────
function ConfiguracionScreen({ user, onLogout }) {
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [pingRes, setPingRes] = useState("");
  useEffect(() => { (async () => { const s = await AsyncStorage.getItem(STORAGE_KEY_URL); setUrl(s || DEFAULT_URL); })(); }, []);
  const saveUrl = async () => {
    let u = url.trim(); if (!u) u = DEFAULT_URL; if (!u.startsWith("http://") && !u.startsWith("https://")) u = `http://${u}`;
    await AsyncStorage.setItem(STORAGE_KEY_URL, u.replace(/\/+$/, "")); setSaved(true); setPingRes(""); setTimeout(() => setSaved(false), 2000);
  };
  const ping = async () => {
    setPingRes("Probando..."); const stored = await AsyncStorage.getItem(STORAGE_KEY_URL); const base = stored || DEFAULT_URL;
    try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 5000); const r = await fetch(`${base}/bien-servicio?activo=S&limit=1`, { signal: c.signal, headers: { "ngrok-skip-browser-warning": "true" } }); clearTimeout(t); setPingRes(r.ok ? "✅ Conexión exitosa" : `❌ Error ${r.status}`); } catch (e) { setPingRes(`❌ ${e.message}`); }
  };
  const logout = () => onLogout();
  return (
    <View style={{ flex: 1 }}>
      <View style={s.header}><Text style={s.title}>⚙️ Configuración</Text></View>
      <ScrollView style={{ padding: 18 }}>
        <View style={cfg.card}><Text style={cfg.label}>Usuario</Text><Text style={cfg.value}>{user?.usuario} {user?.administrador ? "(Admin)" : ""}</Text></View>
        <View style={cfg.card}>
          <Text style={cfg.label}>URL del servidor</Text>
          <TextInput style={cfg.input} value={url} onChangeText={setUrl} placeholder={DEFAULT_URL} autoCapitalize="none" autoCorrect={false} />
          <TouchableOpacity style={[s.btn, { paddingVertical: 12, marginTop: 8 }]} onPress={saveUrl}><Text style={[s.btnT, { textAlign: "center" }]}>{saved ? "✓ Guardado" : "Guardar"}</Text></TouchableOpacity>
          <TouchableOpacity style={[s.btn, { paddingVertical: 12, marginTop: 6, backgroundColor: "#333" }]} onPress={ping}><Text style={[s.btnT, { textAlign: "center" }]}>Probar conexión</Text></TouchableOpacity>
          {pingRes ? <Text style={{ textAlign: "center", marginTop: 8, fontSize: 14, color: pingRes.includes("✅") ? "#2e7d32" : "#c62828" }}>{pingRes}</Text> : null}
        </View>
        <TouchableOpacity style={cfg.logoutBtn} onPress={logout}><Text style={cfg.logoutText}>Cerrar sesión</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const cfg = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 18, marginBottom: 12, elevation: 2 },
  label: { fontSize: 12, color: "#999", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 },
  value: { fontSize: 16, color: "#1a1a2e", fontWeight: "500" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: "#fafafa", color: "#000", marginTop: 8 },
  logoutBtn: { backgroundColor: "#fff", borderRadius: 14, padding: 16, alignItems: "center", marginTop: 8, borderWidth: 1, borderColor: "#e94560" },
  logoutText: { color: "#e94560", fontSize: 16, fontWeight: "600" },
});

function ResumenScreen({ user, onCerrar }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const d = await api("/vencimientos");
        const ahora = new Date();
        const prox = (d.items || []).filter((i) => {
          const diff = Math.ceil((new Date(i.fecha_vto) - ahora) / (1000 * 60 * 60 * 24));
          return diff <= 30 && diff >= 0 && i.activo === "S";
        });
        setItems(prox);
      } catch {}
      setLoading(false);
    })();
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: "#1a1a2e", paddingTop: SB_H }}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <View style={{ padding: 20 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: "#fff", marginBottom: 4 }}>👋 Hola, {user?.usuario}</Text>
        <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>Productos por vencer (próximos 30 días)</Text>
        {loading ? <ActivityIndicator size="large" color="#e94560" style={{ marginTop: 40 }} /> : (
          items.length === 0 ? (
            <View style={{ alignItems: "center", marginTop: 40 }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>✅</Text>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 15, textAlign: "center" }}>No hay productos próximos a vencer</Text>
            </View>
          ) : (
            <FlatList data={items} keyExtractor={(i, idx) => `${i.cod_grupo_bien_servicio}-${i.cod_bien_servicio}-${i.nro_item}-${idx}`}
              renderItem={({ item }) => {
                const diff = Math.ceil((new Date(item.fecha_vto) - new Date()) / (1000 * 60 * 60 * 24));
                return (
                  <View style={{ backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 12, padding: 14, marginBottom: 8 }}>
                    <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>{item.desc_bien_servicio?.trim()}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                      <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Vence: {item.fecha_vto?.split("T")[0]}</Text>
                      <View style={{ marginLeft: 10, backgroundColor: diff <= 7 ? "#e94560" : "#f0a500", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{diff}d</Text>
                      </View>
                    </View>
                  </View>
                );
              }}
            />
          )
        )}
      </View>
      <TouchableOpacity style={{ backgroundColor: "#e94560", margin: 20, borderRadius: 14, paddingVertical: 16, alignItems: "center" }} onPress={onCerrar}>
        <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700" }}>Continuar</Text>
      </TouchableOpacity>
    </View>
  );
}

const TABS = [
  { key: "bienes", label: "Bienes", icon: "📦" },
  { key: "vencimientos", label: "Vencimientos", icon: "⏰" },
  { key: "config", label: "Config", icon: "⚙️" },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("bienes");
  const [showResumen, setShowResumen] = useState(false);
  if (!user) return <LoginScreen onLogin={(u) => { setUser(u); setShowResumen(true); }} />;
  if (showResumen) return <ResumenScreen user={user} onCerrar={() => setShowResumen(false)} />;
  return (
    <View style={{ flex: 1, backgroundColor: "#f0f2f5", paddingTop: SB_H }}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <View style={{ flex: 1 }}>
        {tab === "bienes" && <BienesScreen user={user} />}
        {tab === "vencimientos" && <VencimientosScreen user={user} />}
        {tab === "config" && <ConfiguracionScreen user={user} onLogout={() => setUser(null)} />}
      </View>
      <View style={tabBar.container}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={tabBar.item} onPress={() => setTab(t.key)}>
            <Text style={[tabBar.icon, tab === t.key && tabBar.active]}>{t.icon}</Text>
            <Text style={[tabBar.label, tab === t.key && tabBar.active]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: { backgroundColor: "#1a1a2e", padding: 18, paddingTop: 10 },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" }, count: { color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 2 },
  sr: { flexDirection: "row", padding: 10, gap: 8 },
  inp: { flex: 1, backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 14, fontSize: 14, borderWidth: 1, borderColor: "#e0e0e0", elevation: 1, color: "#000" },
  btn: { backgroundColor: "#e94560", borderRadius: 12, paddingHorizontal: 16, justifyContent: "center", elevation: 2 },
  btnT: { color: "#fff", fontWeight: "600", fontSize: 14 },
  card: { backgroundColor: "#fff", marginHorizontal: 10, marginVertical: 5, borderRadius: 14, padding: 16, elevation: 3, borderLeftWidth: 4, borderLeftColor: "#e94560" },
  cn: { fontSize: 15, fontWeight: "600", color: "#1a1a2e", flex: 1, marginRight: 8 },
  emp: { textAlign: "center", marginTop: 60, color: "#999", fontSize: 15 },
  scanOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.3)" },
  scanText: { color: "#fff", fontSize: 16, fontWeight: "600", marginBottom: 30, textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 },
  scanFrame: { width: 250, height: 120, borderWidth: 3, borderColor: "#1a73e8", borderRadius: 16, backgroundColor: "transparent" },
  scanCancel: { marginTop: 40, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 30, paddingVertical: 12, borderRadius: 10 },
});

const tabBar = StyleSheet.create({
  container: { flexDirection: "row", backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e0e0e0", paddingBottom: 4, elevation: 8 },
  item: { flex: 1, alignItems: "center", paddingVertical: 8 }, icon: { fontSize: 20, opacity: 0.5 },
  label: { fontSize: 11, color: "#888", marginTop: 2 }, active: { opacity: 1, color: "#e94560" },
});
