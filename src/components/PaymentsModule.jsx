import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CreditCard,
  FileText,
  History,
  Plus,
  Receipt,
  Search,
  Wallet,
} from "lucide-react";
import { getWorkOrders, getWorkshopSettings } from "../services/business";
import {
  getOrderPayments,
  getOrderRefunds,
  recordOrderPayment,
} from "../services/payments";
import { defaultWorkshopSettings, formatCurrency } from "../utils/business";
const paymentMethodLabels = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  other: "Otro",
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

function createCollectionAccountHtml(order, settings, paid, balance) {
  const fmt = (amount) =>
    formatCurrency(amount, order.currency_code || settings.currency_code);
  const reference = order.id.replaceAll("-", "").slice(-8).toUpperCase();
  const issueDate = new Date().toLocaleDateString("es-CO");
  const subtotal = order.sale_subtotal ?? order.sale_price;
  const vatLine = order.is_vat_responsible
    ? `<tr><th>IVA (${((order.vat_rate ?? 0) * 100).toFixed(2)}%)</th><td>${escapeHtml(fmt(order.vat_amount ?? 0))}</td></tr>`
    : `<tr><th>IVA</th><td>No discriminado según el perfil fiscal registrado</td></tr>`;

  return `<!doctype html>
<html lang="es-CO">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Cuenta de cobro CC-${reference}</title>
    <style>
      body { color: #0f2137; font: 15px Arial, sans-serif; margin: 0 auto; max-width: 800px; padding: 48px 36px; }
      header { border-bottom: 2px solid #005691; margin-bottom: 28px; padding-bottom: 18px; }
      h1 { color: #0f2137; font-size: 26px; margin: 0 0 8px; }
      p { margin: 7px 0; }
      .muted, footer { color: #4a5568; }
      table { border-collapse: collapse; margin-top: 18px; width: 100%; }
      th, td { border-bottom: 1px solid #e2e8f0; padding: 12px 8px; text-align: left; }
      .totals { margin-left: auto; max-width: 380px; }
      .balance { color: #005691; font-size: 19px; font-weight: 700; }
      .notice { background: #ebf3fa; border: 1px solid #c7dcec; border-radius: 6px; color: #005691; font-weight: 700; margin: 24px 0; padding: 12px; text-align: center; }
      footer { border-top: 1px solid #e2e8f0; font-size: 12px; margin-top: 42px; padding-top: 16px; }
      @media print { body { padding: 0; } }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(order.fiscal_business_name || settings.business_name || "Taller de impresión 3D")}</h1>
      ${order.fiscal_tax_id || settings.tax_id ? `<p>Identificación: ${escapeHtml(order.fiscal_tax_id || settings.tax_id)}</p>` : ""}
      <p class="muted">Cuenta de cobro informativa · Referencia CC-${reference}</p>
    </header>
    <p><strong>Fecha:</strong> ${escapeHtml(issueDate)}</p>
    <p><strong>Cliente:</strong> ${escapeHtml(order.customer_name)}</p>
    <p><strong>Concepto:</strong> ${escapeHtml(order.product_name)} · ${escapeHtml(order.quantity)} ${order.quantity === 1 ? "unidad" : "unidades"}</p>
    <table class="totals">
      <tbody>
        <tr><th>Subtotal</th><td>${escapeHtml(fmt(subtotal))}</td></tr>
        ${vatLine}
        <tr><th>Total del pedido</th><td>${escapeHtml(fmt(order.sale_price))}</td></tr>
        <tr><th>Abonos netos registrados</th><td>${escapeHtml(fmt(paid))}</td></tr>
        <tr class="balance"><th>Saldo por cobrar</th><td>${escapeHtml(fmt(balance))}</td></tr>
      </tbody>
    </table>
    <div class="notice">CUENTA DE COBRO — NO ES FACTURA ELECTRÓNICA NI DOCUMENTO EQUIVALENTE VALIDADO POR LA DIAN</div>
    <footer>Documento informativo para solicitar el pago del saldo indicado. No acredita el pago, autorización de numeración ni validación ante la DIAN. Verifica los requisitos tributarios aplicables con tu contador.</footer>
  </body>
</html>`;
}

export default function PaymentsModule() {
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [settings, setSettings] = useState(defaultWorkshopSettings);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("pending");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [historyOrder, setHistoryOrder] = useState(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [nextOrders, nextPayments, nextRefunds, nextSettings] =
        await Promise.all([
          getWorkOrders(),
          getOrderPayments(),
          getOrderRefunds(),
          getWorkshopSettings(),
        ]);
      setOrders(nextOrders);
      setPayments(nextPayments);
      setRefunds(nextRefunds);
      setSettings(nextSettings);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo cargar la información de pagos.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const activeOrders = useMemo(
    () => orders.filter((order) => order.status !== "cancelled"),
    [orders],
  );
  const paidByOrder = useMemo(() => {
    const totals = new Map();
    for (const payment of payments)
      totals.set(
        payment.order_id,
        (totals.get(payment.order_id) ?? 0) + payment.amount,
      );
    for (const refund of refunds)
      totals.set(
        refund.order_id,
        (totals.get(refund.order_id) ?? 0) - refund.amount,
      );
    return totals;
  }, [payments, refunds]);
  const getPaid = (orderId) => paidByOrder.get(orderId) ?? 0;
  const totalCollected =
    payments.reduce((total, payment) => total + payment.amount, 0) -
    refunds.reduce((total, refund) => total + refund.amount, 0);
  const totalOutstanding = activeOrders.reduce(
    (total, order) => total + Math.max(0, order.sale_price - getPaid(order.id)),
    0,
  );
  const outstandingOrders = activeOrders.filter(
    (order) => order.sale_price - getPaid(order.id) > 0.005,
  );
  const visibleOrders = activeOrders.filter((order) => {
    const isOutstanding = order.sale_price - getPaid(order.id) > 0.005;
    const matchesFilter = paymentFilter === "all" || isOutstanding;
    const matchesSearch = `${order.product_name} ${order.customer_name}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());
    return matchesFilter && matchesSearch;
  });
  const fmt = (amount) => formatCurrency(amount, settings.currency_code);
  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedOrder) {
      setPaymentError("Selecciona un pedido para registrar el pago.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    const paid = getPaid(selectedOrder.id);
    const balance = Math.max(0, selectedOrder.sale_price - paid);
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance + 0.004) {
      setPaymentError(
        "El abono debe ser mayor que cero y no puede superar el saldo pendiente.",
      );
      return;
    }
    setBusy(true);
    setPaymentError("");
    try {
      await recordOrderPayment({
        orderId: selectedOrder.id,
        amount,
        paymentMethod: String(form.get("payment_method")),
        notes: String(form.get("notes")).trim(),
      });
      setSelectedOrder(null);
      setPaymentModalOpen(false);
      await refresh();
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : "No se pudo registrar el pago.",
      );
    } finally {
      setBusy(false);
    }
  }
  function printCollectionAccount(order) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setErrorMessage(
        "El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para generar la cuenta de cobro.",
      );
      return;
    }
    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write(
      createCollectionAccountHtml(
        order,
        settings,
        getPaid(order.id),
        Math.max(0, order.sale_price - getPaid(order.id)),
      ),
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.setTimeout(() => printWindow.print(), 250);
  }
  return (
    <section className="module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">COBROS Y SALDOS</p>
          <h1>Pagos</h1>
          <p className="muted">
            Registra pagos y abonos, consulta saldos y genera cuentas de cobro.
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="button primary"
            disabled={loading || outstandingOrders.length === 0}
            onClick={() => {
              setPaymentError("");
              setSelectedOrder(null);
              setPaymentModalOpen(true);
            }}
            type="button"
          >
            <Plus size={15} />
            Registrar pago
          </button>
          <button
            className="button secondary"
            disabled={loading}
            onClick={() => {
              void refresh();
            }}
            type="button"
          >
            Actualizar
          </button>
        </div>
      </div>
      {errorMessage && (
        <p className="message error" role="alert">
          {errorMessage}
        </p>
      )}
      <div className="stats-grid">
        <article className="stat-card">
          <span className="stat-icon green">
            <Banknote size={18} />
          </span>
          <span className="stat-label">Recaudado neto</span>
          <strong>{fmt(totalCollected)}</strong>
          <small>Pagos registrados</small>
        </article>
        <article className="stat-card">
          <span className="stat-icon blue">
            <Wallet size={18} />
          </span>
          <span className="stat-label">Saldo pendiente</span>
          <strong>{fmt(totalOutstanding)}</strong>
          <small>En pedidos no cancelados</small>
        </article>
        <article className="stat-card">
          <span className="stat-icon purple">
            <Receipt size={18} />
          </span>
          <span className="stat-label">Pedidos por cobrar</span>
          <strong>{outstandingOrders.length}</strong>
          <small>Con saldo pendiente</small>
        </article>
      </div>
      <section className="inventory-panel">
        <div className="panel-heading orders-toolbar">
          <div>
            <h2>Pagos por pedido</h2>
            <p className="muted">
              Se permiten abonos parciales hasta cubrir el valor del pedido.
            </p>
          </div>
          <div className="order-filters">
            <select
              aria-label="Filtrar pedidos por pago"
              onChange={(event) => setPaymentFilter(event.target.value)}
              value={paymentFilter}
            >
              <option value="pending">Con saldo pendiente</option>
              <option value="all">Todos los pedidos</option>
            </select>
            <label className="search-box">
              <Search size={16} />
              <input
                aria-label="Buscar pedidos"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar pedido o cliente"
                value={search}
              />
            </label>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">
            <span className="spinner" />
            Cargando pagos…
          </div>
        ) : visibleOrders.length === 0 ? (
          <div className="empty-state">
            <Receipt size={30} />
            <strong>
              {paymentFilter === "pending" && outstandingOrders.length === 0
                ? "No hay saldos pendientes"
                : "No hay resultados"}
            </strong>
            <span>
              {paymentFilter === "pending" && outstandingOrders.length === 0
                ? "Los pedidos con saldos pendientes aparecerán aquí."
                : "Prueba otra búsqueda o filtro."}
            </span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Precio acordado</th>
                  <th>Pagado neto</th>
                  <th>Saldo</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => {
                  const paid = getPaid(order.id);
                  const balance = Math.max(0, order.sale_price - paid);
                  return (
                    <tr key={order.id}>
                      <td>
                        <div className="order-product">
                          <strong>{order.product_name}</strong>
                          <small>
                            {order.quantity}{" "}
                            {order.quantity === 1 ? "unidad" : "unidades"}
                          </small>
                        </div>
                      </td>
                      <td>{order.customer_name}</td>
                      <td>{fmt(order.sale_price)}</td>
                      <td>{fmt(paid)}</td>
                      <td>
                        <strong>{fmt(balance)}</strong>
                      </td>
                      <td>
                        <span
                          className={`payment-status ${balance <= 0.005 ? "paid" : "pending"}`}
                        >
                          {balance <= 0.005 ? "Pagado" : "Pendiente"}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          {balance > 0.005 && (
                            <button
                              aria-label={`Registrar abono para ${order.product_name}`}
                              className="button secondary payment-action"
                              onClick={() => {
                                setPaymentError("");
                                setSelectedOrder(order);
                                setPaymentModalOpen(true);
                              }}
                              type="button"
                            >
                              <Plus size={15} />
                              Abonar
                            </button>
                          )}
                          <button
                            aria-label={`Generar cuenta de cobro para ${order.product_name}`}
                            className="button secondary payment-action"
                            onClick={() => printCollectionAccount(order)}
                            type="button"
                          >
                            <FileText size={14} />
                            Cuenta de cobro
                          </button>
                          <button
                            aria-label={`Ver pagos de ${order.product_name}`}
                            className="icon-button"
                            onClick={() => setHistoryOrder(order)}
                            type="button"
                          >
                            <History size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="inventory-panel">
        <div className="panel-heading">
          <div>
            <h2>Movimientos recientes</h2>
            <p className="muted">Últimos pagos registrados para tus pedidos.</p>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">
            <span className="spinner" />
            Cargando historial…
          </div>
        ) : payments.length === 0 ? (
          <div className="empty-state">
            <CreditCard size={28} />
            <strong>Aún no hay pagos</strong>
            <span>
              Registra un abono desde un pedido para iniciar el historial.
            </span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Método</th>
                  <th>Nota</th>
                  <th>Importe</th>
                </tr>
              </thead>
              <tbody>
                {payments.slice(0, 100).map((payment) => {
                  const order = orders.find(
                    (item) => item.id === payment.order_id,
                  );
                  return (
                    <tr key={payment.id}>
                      <td>
                        {new Date(payment.created_at).toLocaleString("es-CO")}
                      </td>
                      <td>{order?.product_name ?? "Pedido"}</td>
                      <td>{order?.customer_name ?? "—"}</td>
                      <td>{paymentMethodLabels[payment.payment_method]}</td>
                      <td>{payment.notes || "—"}</td>
                      <td>
                        <strong>{fmt(payment.amount)}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {paymentModalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setSelectedOrder(null);
              setPaymentModalOpen(false);
            }
          }}
        >
          <section
            aria-labelledby="payment-title"
            aria-modal="true"
            className="modal-card"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">REGISTRO DE COBRO</p>
                <h2 id="payment-title">Registrar pago o abono</h2>
                {selectedOrder && (
                  <p className="muted">{selectedOrder.customer_name}</p>
                )}
              </div>
              <button
                aria-label="Cerrar registro de pago"
                className="icon-button"
                onClick={() => {
                  setSelectedOrder(null);
                  setPaymentModalOpen(false);
                }}
                type="button"
              >
                ×
              </button>
            </div>
            <form
              className="form-stack"
              onSubmit={(event) => {
                void handleSubmit(event);
              }}
            >
              <label>
                Pedido
                <select
                  onChange={(event) =>
                    setSelectedOrder(
                      outstandingOrders.find(
                        (order) => order.id === event.target.value,
                      ) ?? null,
                    )
                  }
                  required
                  value={selectedOrder?.id ?? ""}
                >
                  <option disabled value="">
                    Selecciona un pedido pendiente
                  </option>
                  {outstandingOrders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.product_name} · {order.customer_name} · saldo{" "}
                      {fmt(Math.max(0, order.sale_price - getPaid(order.id)))}
                    </option>
                  ))}
                </select>
              </label>
              {selectedOrder ? (
                <p className="message info">
                  Saldo pendiente:{" "}
                  <strong>
                    {fmt(
                      Math.max(
                        0,
                        selectedOrder.sale_price - getPaid(selectedOrder.id),
                      ),
                    )}
                  </strong>
                </p>
              ) : outstandingOrders.length === 0 ? (
                <p className="message info">
                  No hay pedidos con saldo pendiente para registrar un pago.
                </p>
              ) : null}
              {paymentError && (
                <p className="message error" role="alert">
                  {paymentError}
                </p>
              )}
              <label>
                Importe del abono
                <input
                  autoFocus
                  key={selectedOrder?.id ?? "no-order"}
                  min="0.01"
                  max={
                    selectedOrder
                      ? Math.max(
                          0,
                          selectedOrder.sale_price -
                            getPaid(selectedOrder.id),
                        )
                      : undefined
                  }
                  name="amount"
                  required
                  step="0.01"
                  type="number"
                />
              </label>
              <label>
                Método de pago
                <select defaultValue="transfer" name="payment_method">
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                  <option value="card">Tarjeta</option>
                  <option value="other">Otro</option>
                </select>
              </label>
              <label>
                Nota (opcional)
                <input
                  maxLength={500}
                  name="notes"
                  placeholder="Referencia o detalle del pago"
                />
              </label>
              <div className="form-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setSelectedOrder(null);
                    setPaymentModalOpen(false);
                  }}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="button primary"
                  disabled={busy || !selectedOrder}
                  type="submit"
                >
                  {busy ? "Registrando…" : "Registrar pago"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {historyOrder && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHistoryOrder(null);
          }}
        >
          <section
            aria-labelledby="payment-history-title"
            aria-modal="true"
            className="modal-card"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">HISTORIAL</p>
                <h2 id="payment-history-title">{historyOrder.product_name}</h2>
                <p className="muted">{historyOrder.customer_name}</p>
              </div>
              <button
                aria-label="Cerrar historial"
                className="icon-button"
                onClick={() => setHistoryOrder(null)}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="payment-history">
              {payments.filter(
                (payment) => payment.order_id === historyOrder.id,
              ).length === 0 ? (
                <p className="muted">Aún no hay pagos registrados.</p>
              ) : (
                payments
                  .filter((payment) => payment.order_id === historyOrder.id)
                  .map((payment) => (
                    <article key={payment.id}>
                      <div>
                        <strong>{fmt(payment.amount)}</strong>
                        <small>
                          {new Date(payment.created_at).toLocaleString("es-CO")}{" "}
                          · {paymentMethodLabels[payment.payment_method]}
                        </small>
                        {payment.notes && <small>{payment.notes}</small>}
                      </div>
                    </article>
                  ))
              )}
              <p className="payment-history-total">
                <span>Total pagado</span>
                <strong>{fmt(getPaid(historyOrder.id))}</strong>
              </p>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
