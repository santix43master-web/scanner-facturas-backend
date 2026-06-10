# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v55.0.0/ before writing any code.

## Latest Changes (Sesión 2026-06-06)
- **Cards de Bienes**: Sacado el precio Costo, solo muestra Venta (rojo) y Venta Mayorista + "desde X u."
- **Pestaña Revisados**: Nuevo toggle Pendientes/Revisados en VencimientosScreen. Revisados carga `/vencimientos/historial` y muestra cards con fecha anterior → fecha nueva.
- **API timeout**: `api()` ahora tiene `AbortController` con 15s timeout para que no cuelgue.
- **CModal touch fix**: `ScrollView` dentro de modales tiene `keyboardShouldPersistTaps="always"` y `nestedScrollEnabled`.
- **Revisado bug**: Enviaba `fecha_vto: undefined` al servidor → violaba NOT NULL en `vencimientos_historial.fecha_nueva`. Fix: ahora manda `item.fecha_vto`.
- **Permisos**: `Camera.requestCameraPermissionsAsync()` + `MediaLibrary.requestPermissionsAsync()` en ambos 📷. Agregado `expo-media-library` a package.json y app.json.
- **try/catch en todos los handlers**: revisado, inactivar, saveEdit, load, buscarProd, loadHistorial — no más promesas sin manejar.
- **crearVenc**: usa `formRef` para estado fresco, muestra error en vez de `return` silencioso.

## Build
- Compilar manual: `npx eas build --platform android --profile preview --clear-cache`
- `expo-media-library` ya instalado (npm install hecho).
