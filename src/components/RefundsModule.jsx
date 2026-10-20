import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CircleDollarSign, RotateCcw, Search } from "lucide-react";
import { getWorkOrders, getWorkshopSettings } from "../services/business";
import {
  getOrderPayments,
  getOrderRefunds,
  recordOrderRefund,
} from "../services/payments";
import { defaultWorkshopSettings, formatCurrency } from "../utils/business";

const refundMethodLabels = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  other: "Otro",
};

export default function RefundsModule() {
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [settings, setSettings] = useState(defaultWorkshopSettings);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedPayment, setSelectedPayment] = useState(null);

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
          : "No se pudieron cargar las devoluciones.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ordersById = useMemo(
    () => new Map(orders.map((order) => [order.id, order])),
    [orders],
  );
  const refundedByPayment = useMemo(() => {
    const totals = new Map();
    for (const refund of refunds)
      totals.set(
        refund.payment_id,
        (totals.get(refund.payment_id) ?? 0) + refund.amount,
      );
    return totals;
  }, [refunds]);
  const refundablePayments = payments.filter((payment) => {
    const order = ordersById.get(payment.order_id);
    return (
      order?.status !== "cancelled" &&
      order?.status !== "delivered" &&
      payment.amount - (refundedByPayment.get(payment.id) ?? 0) > 0.005
    );
  });
  const visiblePayments = refundablePayments.filter((payment) => {
    const order = ordersById.get(payment.order_id);
    return `${order?.product_name ?? ""} ${order?.customer_name ?? ""}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  });
  const totalRefunded = refunds.reduce(
    (total, refund) => total + refund.amount,
    0,
  );
  const fmt = (amount) => formatCurrency(amount, settings.currency_code);

  async function handleRefund(event) {
    event.preventDefault();
    if (!selectedPayment) return;
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    const available =
      selectedPayment.amount - (refundedByPayment.get(selectedPayment.id) ?? 0);
    if (!Number.isFinite(amount) || amount <= 0 || amount > available + 0.004) {
      setFormError(
        "El importe debe ser mayor que cero y no superar el saldo disponible del pago.",
      );
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      await recordOrderRefund({
        paymentId: selectedPayment.id,
        amount,
        refundMethod: String(form.get("refund_method")),
        notes: String(form.get("notes")).trim(),
      });
      setSelectedPayment(null);
      await refresh();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "No se pudo registrar la devolución.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">AJUSTES DE COBRO</p>
          <h1>Devoluciones</h1>
          <p className="muted">
            Registra reembolsos manuales sin borrar el historial original del
            pago.
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
      {errorMessage && (
        <p className="message error" role="alert">
          {errorMessage}
        </p>
      )}
      <p className="message info">
        Confirma el reembolso fuera de la aplicación y regístralo aquí. Para
        cancelar un pedido, devuelve todos sus abonos y luego confirma la
        cancelación en Pedidos. Los pedidos entregados requieren un flujo de
        devolución de producto distinto.
      </p>
      <div className="stats-grid">
        <article className="stat-card">
          <span className="stat-icon purple">
            <RotateCcw size={18} />
          </span>
          <span className="stat-label">Total devuelto</span>
          <strong>{fmt(totalRefunded)}</strong>
          <small>{refunds.length} devoluciones registradas</small>
        </article>
        <article className="stat-card">
          <span className="stat-icon blue">
            <Banknote size={18} />
          </span>
          <span className="stat-label">Pagos con saldo reembolsable</span>
          <strong>{refundablePayments.length}</strong>
          <small>Se puede devolver una parte o el total</small>
        </article>
      </div>
      <section className="inventory-panel">
        <div className="panel-heading orders-toolbar">
          <div>
            <h2>Pagos disponibles para devolver</h2>
            <p className="muted">
              Cada devolución queda asociada al abono y al pedido originales.
            </p>
          </div>
          <label className="search-box">
            <Search size={16} />
            <input
              aria-label="Buscar pagos para devolver"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar pedido o cliente"
              value={search}
            />
          </label>
        </div>
        {loading ? (
          <div className="empty-state">
            <span className="spinner" />
            Cargando pagos…
          </div>
        ) : visiblePayments.length === 0 ? (
          <div className="empty-state">
            <CircleDollarSign size={30} />
            <strong>
              {refundablePayments.length === 0
                ? "No hay pagos para devolver"
                : "No hay resultados"}
            </strong>
            <span>
              {refundablePayments.length === 0
                ? "Los pagos con saldo disponible aparecerán aquí."
                : "Prueba otra búsqueda."}
            </span>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Fecha del pago</th>
                  <th>Abono</th>
                  <th>Ya devuelto</th>
                  <th>Disponible</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visiblePayments.map((payment) => {
                  const order = ordersById.get(payment.order_id);
                  const refunded = refundedByPayment.get(payment.id) ?? 0;
                  return (
                    <tr key={payment.id}>
                      <td>
                        <strong>{order?.product_name ?? "Pedido"}</strong>
                      </td>
                      <td>{order?.customer_name ?? "—"}</td>
                      <td>
                        {new Date(payment.created_at).toLocaleDateString(
                          "es-CO",
                        )}
                      </td>
                      <td>{fmt(payment.amount)}</td>
                      <td>{fmt(refunded)}</td>
                      <td>
                        <strong>{fmt(payment.amount - refunded)}</strong>
                      </td>
                      <td>
                        <button
                          className="button secondary payment-action"
                          onClick={() => {
                            setFormError("");
                            setSelectedPayment(payment);
                          }}
                          type="button"
                        >
                          <RotateCcw size={15} />
                          Devolver
                        </button>
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
            <h2>Historial de devoluciones</h2>
            <p className="muted">
              Las devoluciones quedan registradas y no se pueden borrar desde la
              aplicación.
            </p>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">
            <span className="spinner" />
            Cargando historial…
          </div>
        ) : refunds.length === 0 ? (
          <div className="empty-state">
            <RotateCcw size={28} />
            <strong>Aún no hay devoluciones</strong>
            <span>
              Los movimientos aparecerán aquí después de registrarlos.
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
                {refunds.slice(0, 100).map((refund) => {
                  const order = ordersById.get(refund.order_id);
                  return (
                    <tr key={refund.id}>
                      <td>
                        {new Date(refund.created_at).toLocaleString("es-CO")}
                      </td>
                      <td>{order?.product_name ?? "Pedido"}</td>
                      <td>{order?.customer_name ?? "—"}</td>
                      <td>{refundMethodLabels[refund.refund_method]}</td>
                      <td>{refund.notes || "—"}</td>
                      <td>
                        <strong>{fmt(refund.amount)}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selectedPayment && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy)
              setSelectedPayment(null);
          }}
        >
          <section
            aria-labelledby="refund-title"
            aria-modal="true"
            className="modal-card"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">REGISTRO DE DEVOLUCIÓN</p>
                <h2 id="refund-title">Devolver un pago</h2>
                <p className="muted">
                  {ordersById.get(selectedPayment.order_id)?.product_name} ·{" "}
                  {ordersById.get(selectedPayment.order_id)?.customer_name}
                </p>
              </div>
            </div>
            <form
              className="form-stack"
              onSubmit={(event) => void handleRefund(event)}
            >
              <p className="message info">
                Saldo disponible:{" "}
                <strong>
                  {fmt(
                    selectedPayment.amount -
                      (refundedByPayment.get(selectedPayment.id) ?? 0),
                  )}
                </strong>
              </p>
              {formError && (
                <p className="message error" role="alert">
                  {formError}
                </p>
              )}
              <label>
                Importe a devolver
                <input
                  autoFocus
                  max={
                    selectedPayment.amount -
                    (refundedByPayment.get(selectedPayment.id) ?? 0)
                  }
                  min="0.01"
                  name="amount"
                  required
                  step="0.01"
                  type="number"
                />
              </label>
              <label>
                Método de devolución
                <select defaultValue="transfer" name="refund_method">
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
                  placeholder="Referencia o motivo"
                />
              </label>
              <div className="form-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setSelectedPayment(null)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  type="submit"
                >
                  {busy ? "Guardando…" : "Registrar devolución"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
