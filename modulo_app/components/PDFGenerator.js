export function generarPDF(datosFactura, sucursalActual) {
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

  return `
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
}
