// Generador de códigos de licencia para ScanFact Pro
// Usá este script en Node.js para generar códigos válidos
// Código de validación en la app: R21-XXXX-XXXX-XXXX con suma checksum % 7 === 0

function generarCodigo() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  let codigo;
  do {
    codigo = `R21-${seg()}-${seg()}-${seg()}`;
  } while (!validarCodigo(codigo));
  return codigo;
}

function validarCodigo(codigo) {
  if (!/^R21-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo)) return false;
  const partes = codigo.split('-');
  const suma = partes.slice(1).join('').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return suma % 7 === 0;
}

// Generar 10 códigos
console.log('=== CÓDIGOS DE LICENCIA R21 PRO ===\n');
for (let i = 0; i < 10; i++) {
  const codigo = generarCodigo();
  console.log(`${i + 1}. ${codigo}  ${validarCodigo(codigo) ? '✅' : '❌'}`);
}
console.log('\nDale estos códigos a tus clientes después del pago.');
console.log('La app los valida localmente (no necesita internet para activar).');
