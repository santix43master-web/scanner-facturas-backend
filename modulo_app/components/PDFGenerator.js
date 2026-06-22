export function generarPDF(datosFactura, sucursalActual) {
  let filasItems = '';
  if (datosFactura.items && datosFactura.items.length > 0) {
    filasItems = datosFactura.items.map((item, i) => `
      <tr>
        <td style="padding:8px;text-align:center;font-size:12px;border-bottom:1px solid #ddd;">${i + 1}</td>
        <td style="padding:8px;font-size:12px;border-bottom:1px solid #ddd;">${item.descripcion || ''}</td>
        <td style="padding:8px;text-align:center;font-size:12px;border-bottom:1px solid #ddd;">${item.codigo || '-'}</td>
        <td style="padding:8px;text-align:center;font-size:12px;border-bottom:1px solid #ddd;">${item.cantidad || 1}</td>
        <td style="padding:8px;text-align:right;font-size:12px;border-bottom:1px solid #ddd;">${Number(item.precio_unitario || 0).toLocaleString('es-PY')}</td>
        <td style="padding:8px;text-align:right;font-size:12px;font-weight:600;border-bottom:1px solid #ddd;">${Number(item.subtotal || 0).toLocaleString('es-PY')}</td>
      </tr>
    `).join('');
  } else {
    filasItems = '<tr><td colspan="6" style="padding:20px;text-align:center;color:#999;">Sin artículos</td></tr>';
  }

  return `
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Helvetica, Arial, sans-serif; padding: 32px; color: #333; font-size: 13px; }
      h1 { font-size: 22px; font-weight: 300; letter-spacing: 4px; margin-bottom: 4px; }
      .sub { color: #666; font-size: 12px; margin-bottom: 24px; }
      .info { margin-bottom: 24px; }
      .info p { margin-bottom: 3px; font-size: 12px; }
      .info strong { color: #00838F; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
      th { padding: 10px 8px; text-align: left; font-size: 11px; font-weight: 600; color: #00838F; border-bottom: 2px solid #00838F; text-transform: uppercase; letter-spacing: 0.5px; }
      td { padding: 8px; font-size: 12px; }
      .total { text-align: right; padding: 16px 0; border-top: 2px solid #00838F; }
      .total h2 { font-size: 14px; font-weight: 600; color: #00838F; margin-bottom: 4px; }
      .total .monto { font-size: 26px; font-weight: 300; }
      .footer { margin-top: 40px; text-align: center; color: #999; font-size: 11px; border-top: 1px solid #eee; padding-top: 16px; }
    </style></head><body>
      <h1>FACTURA</h1>
      <p class="sub">${sucursalActual} · ${new Date().toLocaleDateString('es-PY')}</p>
      <div class="info">
        <p><strong>Vendedor:</strong> ${datosFactura.nombreVendedor || '—'}</p>
        <p><strong>RUC:</strong> ${datosFactura.rucVendedor || '—'}</p>
        <p><strong>N°:</strong> ${datosFactura.numeroFactura || '—'} · <strong>Timbrado:</strong> ${datosFactura.timbrado || '—'}</p>
        <p><strong>Emisión:</strong> ${datosFactura.fechaEmision || '—'}</p>
      </div>
      <table>
        <thead><tr><th>#</th><th>Descripción</th><th>Código</th><th>Cant.</th><th>P.Unit.</th><th>Subtotal</th></tr></thead>
        <tbody>${filasItems}</tbody>
      </table>
      <div class="total">
        <h2>TOTAL</h2>
        <div class="monto">Gs ${Number(datosFactura.totalGeneral || 0).toLocaleString('es-PY')}</div>
      </div>
      <div class="footer">Scanner R21 · ${new Date().getFullYear()}</div>
    </body></html>
  `;
}
