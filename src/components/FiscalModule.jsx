import { useCallback, useEffect, useState } from "react";
import { FileText, Printer } from "lucide-react";
import { getWorkOrders, getWorkshopSettings } from "../services/business";
import {
  defaultWorkshopSettings,
  formatCurrency,
} from "../utils/business";

const statusLabels = {
  pending: "Pendiente",
  printing: "En impresión",
  post_processing: "Post-procesamiento",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const entityLabels = {
  NATURAL_PERSON: "Persona natural",
  JURIDICAL_PERSON_SAS: "Persona jurídica (SAS)",
};

const taxRegimeLabels = {
  NOT_APPLICABLE: "Sin especificar",
  ORDINARY: "Régimen ordinario",
  SIMPLE: "Régimen Simple de Tributación",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function createQuotationHtml(order) {
  const prefix = order.document_prefix || "COT";
  const orderReference = order.id.replaceAll("-", "").slice(-8).toUpperCase();
  const number = `${prefix}-${orderReference}`;
  const currency = order.currency_code || "COP";
  const fmt = (amount) => formatCurrency(amount, currency);
  const subtotal = order.sale_subtotal ?? order.sale_price;
  const vatRate = order.vat_rate ?? 0;
  const vatAmount = order.vat_amount ?? 0;
  const businessName =
    order.fiscal_business_name || "Taller de impresión 3D";
  const taxId = order.fiscal_tax_id
    ? `<p>Identificación: ${escapeHtml(order.fiscal_tax_id)}</p>`
    : "";
  const issueDate = new Date(order.created_at).toLocaleDateString("es-CO");
  const vatLine = order.is_vat_responsible
    ? `<tr><th>IVA (${(vatRate * 100).toFixed(2)}%)</th><td>${escapeHtml(fmt(vatAmount))}</td></tr>`
    : `<tr><th>IVA</th><td>No discriminado según el perfil fiscal registrado</td></tr>`;

  return `<!doctype html>
<html lang="es-CO">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(number)} - Cotización</title>
    <style>
      body { color: #0f2137; font: 15px Arial, sans-serif; margin: 0 auto; max-width: 800px; padding: 48px 36px; }
      header { border-bottom: 2px solid #005691; margin-bottom: 28px; padding-bottom: 18px; }
      h1 { color: #0f2137; font-size: 26px; margin: 0 0 8px; }
      h2 { font-size: 18px; margin: 30px 0 12px; }
      p { margin: 5px 0; }
      .muted { color: #4a5568; }
      .banner { background: #fff4db; border: 1px solid #f0d18f; border-radius: 6px; color: #684b12; font-weight: 700; margin: 22px 0; padding: 12px; text-align: center; }
      table { border-collapse: collapse; margin-top: 18px; width: 100%; }
      th, td { border-bottom: 1px solid #e2e8f0; padding: 12px 8px; text-align: left; }
      .totals { margin-left: auto; max-width: 360px; }
      .grand-total { font-size: 19px; font-weight: 700; }
      footer { border-top: 1px solid #e2e8f0; color: #4a5568; font-size: 12px; margin-top: 42px; padding-top: 16px; }
      @media print { body { padding: 0; } .banner { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(businessName)}</h1>
      ${taxId}
      <p class="muted">${escapeHtml(entityLabels[order.fiscal_entity_type] || entityLabels.NATURAL_PERSON)} · ${escapeHtml(taxRegimeLabels[order.fiscal_tax_regime] || taxRegimeLabels.NOT_APPLICABLE)}</p>
    </header>
    <h2>Cotización / cuenta de cobro</h2>
    <p><strong>Referencia interna:</strong> ${escapeHtml(number)}</p>
    <p><strong>Fecha:</strong> ${escapeHtml(issueDate)}</p>
    <p><strong>Cliente:</strong> ${escapeHtml(order.customer_name)}</p>
    <p><strong>Pedido:</strong> ${escapeHtml(order.product_name)}</p>
    <p><strong>Estado:</strong> ${escapeHtml(statusLabels[order.status] || order.status)}</p>
    <table>
      <thead><tr><th>Concepto</th><th>Cantidad</th><th>Valor</th></tr></thead>
      <tbody><tr><td>${escapeHtml(order.product_name)}</td><td>${escapeHtml(order.quantity)}</td><td>${escapeHtml(fmt(subtotal))}</td></tr></tbody>
    </table>
    <table class="totals">
      <tbody>
        <tr><th>Subtotal</th><td>${escapeHtml(fmt(subtotal))}</td></tr>
        ${vatLine}
        <tr class="grand-total"><th>Total</th><td>${escapeHtml(fmt(order.sale_price))}</td></tr>
      </tbody>
    </table>
    <div class="banner">DOCUMENTO INTERNO — NO ES FACTURA ELECTRÓNICA DIAN NI DOCUMENTO EQUIVALENTE VALIDADO</div>
    <footer>Esta impresión es una cotización o cuenta de cobro informativa. No acredita validación ante la DIAN, autorización de numeración, pago ni documento tributario. Verifica tus obligaciones y requisitos con tu contador.</footer>
  </body>
</html>`;
}

export default function FiscalModule() {
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState(defaultWorkshopSettings);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [nextOrders, nextSettings] = await Promise.all([
        getWorkOrders(),
        getWorkshopSettings(),
      ]);
      setOrders(nextOrders.filter((order) => order.status !== "cancelled"));
      setSettings(nextSettings);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las cotizaciones.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function printQuotation(order) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setErrorMessage(
        "El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para generar el PDF.",
      );
      return;
    }
    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write(createQuotationHtml(order));
    printWindow.document.close();
    printWindow.focus();
    printWindow.setTimeout(() => printWindow.print(), 250);
  }

  const fmt = (amount) => formatCurrency(amount, settings.currency_code);

  return (
    <section className="module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">DOCUMENTOS COMERCIALES · COLOMBIA</p>
          <h1>Cotizaciones y cuentas de cobro</h1>
          <p className="muted">
            Imprime o guarda en PDF un resumen con los valores fiscales
            registrados al crear cada pedido.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => void refresh()}
          type="button"
        >
          Actualizar
        </button>
      </div>
      <p className="message info">
        Estos documentos son internos. No constituyen factura electrónica DIAN,
        documento equivalente validado ni numeración autorizada. El perfil
        tributario no se activa solo por la fecha prevista de transición.
      </p>
      {errorMessage && (
        <p className="message error" role="alert">
          {errorMessage}
        </p>
      )}
      <section className="inventory-panel">
        <div className="panel-heading">
          <div>
            <span className="stat-icon purple">
              <FileText size={18} />
            </span>
            <h2>Documentos por pedido</h2>
            <p className="muted">
              Referencia: prefijo configurado más el identificador del pedido;
              no es un consecutivo fiscal.
            </p>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">
            <span className="spinner" />
            Cargando pedidos…
          </div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <FileText size={30} />
            <strong>No hay pedidos para cotizar</strong>
            <span>Los pedidos activos aparecerán en esta lista.</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Subtotal</th>
                  <th>IVA</th>
                  <th>Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.product_name}</strong>
                      <small>{order.quantity} unidades</small>
                    </td>
                    <td>{order.customer_name}</td>
                    <td>{statusLabels[order.status] || order.status}</td>
                    <td>
                      {fmt(order.sale_subtotal ?? order.sale_price)}
                    </td>
                    <td>
                      {order.is_vat_responsible
                        ? fmt(order.vat_amount)
                        : "No discriminado"}
                    </td>
                    <td>
                      <strong>{fmt(order.sale_price)}</strong>
                    </td>
                    <td>
                      <button
                        className="button secondary payment-action"
                        onClick={() => printQuotation(order)}
                        type="button"
                      >
                        <Printer size={15} />
                        Imprimir / Guardar PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
